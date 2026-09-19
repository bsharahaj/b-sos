# B SOS

Community emergency-response web app: publish an SOS, nearby helpers with matching skills are alerted in real time, the first to accept is tracked live on a map until the SOS is resolved.

B SOS complements official emergency services — it never replaces them.

Project rules and the full plan summary are in [`CLAUDE.md`](CLAUDE.md); the plan itself is in [`docs/`](docs/). The HTTP API is documented in [`docs/API.md`](docs/API.md).

## Layout

```
client/   React 18 + Vite + Tailwind + React Router   (dev server on :5173)
server/   Express + Socket.io + Prisma + Zod + pino    (API on :3000)
shared/   constants.js — enums used by both sides
docs/     plan, API notes, decisions
```

## Requirements

- Node.js **20.19+** (`node -v`)
- PostgreSQL 18 — a dev database (`DATABASE_URL`) and a separate test database (`TEST_DATABASE_URL`, e.g. local `bsos_test`)
- Redis — not needed yet

## Server

```bash
cd server
cp .env.example .env      # then edit values
npm install               # also runs `prisma generate`
npm run dev               # nodemon on http://localhost:3000
npm test                  # Vitest + Supertest
```

Check it: open http://localhost:3000/health → `{"status":"ok",...}`.

Database commands (once models exist):

```bash
npx prisma migrate dev --name <short-name>   # create + apply a migration
npx prisma studio                            # browse the DB
```

## Client

```bash
cd client
cp .env.example .env
npm install
npm run dev               # Vite on http://localhost:5173
npm run build             # production build into client/dist
```

`npm run dev` also prints a **Network** URL (e.g. `http://192.168.x.x:5173`) — open it on a phone on the same Wi-Fi to test mobile layouts.

## Shared constants

Import enums from `shared/constants.js` instead of hard-coding strings:

```js
// client
import { SOS_TYPES } from '@shared/constants.js';
// server (relative path from the importing file)
import { SOS_TYPES } from '../../shared/constants.js';
```

Changing an enum affects both sides — agree on it with the other developer first.
