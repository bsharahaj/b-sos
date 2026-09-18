# B SOS — project memory for Claude Code

Read this file fully at the start of every session. The full plan is in `docs/B-SOS-Project-Plan.pdf`; this file is the short version plus the rules. If code and plan disagree, ask before guessing.

## 1. What we are building

B SOS is a community emergency-response web app. A user in trouble (accident, flat tyre, medical situation, stranded, unsafe) publishes an SOS with type + location. The server finds the nearest available helpers whose skills match, notifies them in real time, the first to accept is assigned, and the requester watches the helper approach live on a map until the SOS is resolved. Both sides rate each other afterwards.

B SOS complements official emergency services; it never replaces them. The emergency number is always visible on the SOS screen.

Roles: Requester, Helper (any user can be one), Verified professional (credentials approved by admin), Admin.

## 2. Stack (fixed — do not swap libraries without asking)

| Layer | Choice |
|---|---|
| Client | React 18 + Vite, React Router, Tailwind CSS, Leaflet + react-leaflet, socket.io-client, axios |
| Server | Node 20, Express, Socket.io, Prisma ORM, Zod, bcrypt, jsonwebtoken, pino, helmet, cors, express-rate-limit |
| Database | PostgreSQL 16 (PostGIS enabled later for geo queries) |
| Cache / live data | Redis (ioredis) — online helpers, live positions, rate limits; BullMQ for scheduled jobs |
| Files | Cloudinary (photos, credential documents) |
| Push | Firebase Cloud Messaging (web push) — Tier 3 |
| Tests | Vitest (unit), Supertest (API), Playwright (e2e) |
| Language | JavaScript, ES modules (`"type": "module"`). No TypeScript. |
| Hosting | Client: Vercel. Server + Postgres + Redis: Railway. |

## 3. Repository layout

```
b-sos/
  CLAUDE.md
  README.md
  docs/                      plan PDF, API notes, decisions
  shared/constants.js        SOS_TYPES, SKILLS, STATUSES, RADII (imported by both sides)
  client/
    src/
      main.jsx, App.jsx
      pages/                 one file per route: Login, Register, Home, CreateSos, ActiveSos, HelperAlerts, Profile, History, admin/*
      components/            reusable UI (Map, SosCard, StatusTimeline, RatingStars, ...)
      api/                   http.js (axios instance w/ refresh), socket.js
      hooks/                 useAuth, useGeolocation, useSocket
      store/                 auth + active SOS state (React context or zustand)
  server/
    prisma/schema.prisma, migrations/
    src/
      index.js               boots express + socket.io
      app.js                 express app (exported for tests)
      config/                env parsing (Zod), redis client, prisma client
      routes/                auth.js, me.js, sos.js, messages.js, ratings.js, reports.js, admin.js
      services/              matching.js, sosLifecycle.js, notifications.js, escalation.js
      middleware/            requireAuth.js, requireAdmin.js, validate.js, rateLimit.js, errorHandler.js
      socket/                index.js (auth + rooms), handlers/*.js
      utils/                 geo.js (haversine), tokens.js
    tests/                   *.test.js mirroring src
```

## 4. Domain rules (the business logic)

- **Enums** (define once in `shared/constants.js`):
  - SOS types: `MEDICAL, VEHICLE, TRANSPORT, SAFETY, OTHER`
  - Skills: `MEDICAL, MECHANIC, DRIVER, GENERAL`
  - Status: `OPEN -> ACCEPTED -> EN_ROUTE -> ARRIVED -> RESOLVED`, or `CANCELLED` from any non-final state
  - Verification: `NONE, PENDING, VERIFIED, REJECTED`
- **Type -> skills mapping**: MEDICAL->[MEDICAL, GENERAL], VEHICLE->[MECHANIC, DRIVER, GENERAL], TRANSPORT->[DRIVER, GENERAL], SAFETY->[GENERAL], OTHER->[GENERAL]
- **Matching**: helpers with `is_available = true`, not banned, `last_seen_at` within 10 min, skills overlap, within radius. Radius starts at 3 km; escalation widens to 5 km after 60 s and 10 km after 120 s with no accept; after 180 s tell the requester to call emergency services. Order: verified first (for MEDICAL), then distance. Max 15 helpers notified per round.
- **Accept**: exactly one helper can win. Implement inside a Prisma transaction that re-reads the SOS with `FOR UPDATE` (raw query) and only updates if status is still OPEN. Losers get `sos:taken`.
- **Status transitions** are validated on the server (`sosLifecycle.js` owns the allowed-transition table). Requester may cancel while OPEN/ACCEPTED; helper may cancel while ACCEPTED/EN_ROUTE (counts against them).
- **Live positions**: helper sends `helper:location` every 3–5 s. Store in Redis (`pos:{userId}` with TTL 60 s) and forward to room `sos:{id}` only. Write a final sample to Postgres `location_updates` on resolve. Never write every ping to Postgres.
- **Privacy**: requester's exact location is visible only to the assigned helper while the SOS is active. Helper's live location is visible only to that SOS's requester. Location history is kept 30 days.
- **Trust**: phone verification required before creating an SOS. Max 3 OPEN SOS per user per day. 3 open reports => auto-suspend pending admin review. Ratings are 1–5 with optional comment, one per user per SOS.
- **Location quality**: always use `watchPosition` with `enableHighAccuracy: true`; keep the best sample in the first 5 s; store `accuracy_m` with every SOS; if accuracy > 100 m show the wide circle and let the user drag the pin before sending.

## 5. Data model (Prisma) — summary

Every model: `id String @id @default(uuid())`, `createdAt`, `updatedAt`.

- `User`: email (unique), passwordHash, name, phone (unique), phoneVerified, photoUrl, role (USER|ADMIN), isBanned, isSuspended, ratingAvg, ratingCount, trustedContactPhone, fcmToken
- `HelperProfile` (1:1 User): skills String[], isAvailable, verificationStatus, credentialDocUrl, lat, lng, lastSeenAt
- `SosRequest`: requesterId, type, description, photoUrl, lat, lng, accuracyM, status, helperId?, acceptedAt?, enRouteAt?, arrivedAt?, resolvedAt?, cancelledAt?, cancelledBy?, cancelReason?
- `SosNotification`: sosId, helperId, channel (SOCKET|PUSH), round (1|2|3), sentAt, seenAt?, response (NONE|ACCEPT|DECLINE)
- `LocationUpdate`: sosId, userId, lat, lng, recordedAt
- `Message`: sosId, senderId, body, sentAt, readAt?
- `Rating`: sosId, fromUserId, toUserId, stars, comment? — unique(sosId, fromUserId)
- `Report`: reporterId, reportedUserId, sosId?, reason, status (OPEN|REVIEWED|DISMISSED), adminNote?
- `AdminAction`: adminId, action, targetUserId?, note

Phase 1 stores lat/lng as Float columns and filters with a bounding box + haversine in JS. Phase 2 (week 9) migrates to PostGIS `geography(Point)` with a GIST index and `ST_DWithin`.

## 6. API surface

All JSON. Auth via `Authorization: Bearer <access>`; refresh via httpOnly cookie `refresh_token`. Errors: `{ error: { code, message, details? } }`.

```
POST /auth/register  /auth/login  /auth/refresh  /auth/logout
POST /auth/phone/send-code  /auth/phone/verify
GET  /me            PATCH /me            PATCH /me/helper (skills, isAvailable)
POST /me/credentials (multipart)          PATCH /me/fcm-token
POST /sos           GET /sos/:id          GET /sos/mine?role=requester|helper
POST /sos/:id/accept  /decline  /en-route  /arrived  /resolve  /cancel
GET  /sos/:id/messages   POST /sos/:id/messages
POST /sos/:id/rating
POST /reports
GET  /admin/stats   GET /admin/users   PATCH /admin/users/:id (ban/suspend)
GET  /admin/credentials   PATCH /admin/credentials/:id (approve/reject)
GET  /admin/sos   GET /admin/reports   PATCH /admin/reports/:id
GET  /health
```

## 7. Socket.io contract

Client connects with `auth: { token }`. Server verifies JWT, joins `user:{id}`; when assigned to / owner of an SOS, joins `sos:{id}`.

| Event | Direction | Payload |
|---|---|---|
| `helper:location` | client -> server | `{ lat, lng, accuracy }` |
| `sos:new` | server -> matched helpers | `{ sosId, type, distanceM, requesterRating, createdAt }` |
| `sos:taken` | server -> other notified helpers | `{ sosId }` |
| `sos:accepted` | server -> requester | `{ sosId, helper: { id, name, photoUrl, ratingAvg, verified }, etaMin }` |
| `sos:helper-location` | server -> requester | `{ sosId, lat, lng }` |
| `sos:status` | server -> requester + helper | `{ sosId, status, at }` |
| `sos:escalated` | server -> requester | `{ sosId, round, radiusKm }` |
| `chat:message` | both | `{ sosId, id, senderId, body, sentAt }` |

Rule: never `io.emit` to everyone. Always emit to a specific room.

## 8. Roadmap (build in this order; each tier must be demo-able)

1. **Tier 1 MVP**: auth + phone verification, profile + helper skills/availability, create SOS with map + draggable pin, matching, real-time alerts, accept (one winner), live tracking, full lifecycle, admin v1 (users, SOS list, ban).
2. **Tier 2 Trust**: ratings, credential verification + badge, reports + auto-suspend, rate limits, trusted-contact SMS, in-SOS chat.
3. **Tier 3 Quality**: FCM push, PWA install + service worker, escalation job (BullMQ), history + helper stats, Arabic RTL + English, admin analytics (heatmap, response times), PostGIS migration.
4. **Tier 4 Growth** (after course): organisations, community zones, React Native apps, incentives, B2B integrations.

## 9. Coding standards

- Small functions, descriptive names, early returns. Comment only the non-obvious.
- Every route: Zod schema -> `validate()` middleware -> thin handler -> service. No business logic in route files.
- Services are pure where possible and unit-tested. Route handlers are covered by Supertest.
- All async errors go through `errorHandler`; never `try/catch` and swallow.
- Client: pages compose components; API calls live in `src/api`, not in components. Mobile-first Tailwind; every page checked at 375 px width.
- Accessibility: buttons are `<button>`, inputs have labels, colour is never the only signal.
- No `console.log` in committed server code; use pino. Client may use `console.error` only.
- Secrets only in `.env`. Keep `.env.example` in sync. `.env` is git-ignored.

## 10. How Claude should work in this repo

- One task at a time. Finish, run it (`npm test` and/or start the dev server), confirm it works, then stop and summarise in 3–6 lines what changed and how to verify.
- Do not touch files outside the task. Do not refactor unasked.
- When adding an endpoint, add: Zod schema, route, service, Supertest test, and a line in `docs/API.md`.
- When adding a socket event, update the table in section 7 of this file.
- When a schema changes: edit `schema.prisma`, run `npx prisma migrate dev --name <short-name>`, regenerate, and mention it.
- Ask before: adding a dependency, changing the folder layout, changing an enum, or anything that affects the other developer's work.
- Explain briefly *why* when introducing a pattern the developers may not know (transactions, rooms, refresh tokens).

## 11. Commands

```
# server
cd server && npm run dev          # nodemon on :3000
cd server && npm test
cd server && npx prisma migrate dev
cd server && npx prisma studio    # browse the DB

# client
cd client && npm run dev          # vite on :5173

# both from root (once configured)
npm run dev
```

Environment (`server/.env.example`): `DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CLIENT_ORIGIN, CLOUDINARY_URL, SMS_PROVIDER_KEY, FCM_SERVER_KEY`.
Client (`client/.env.example`): `VITE_API_URL, VITE_SOCKET_URL, VITE_FIREBASE_*`.

## 12. Definition of done (every feature)

- Works on a phone over mobile data, not only localhost.
- Has at least one automated test.
- Reviewed in a pull request by the other developer.
- Errors are handled and shown to the user in plain language.
- Section 6/7 of this file and `docs/API.md` are updated if the contract changed.
