# B SOS API

All JSON. Errors: `{ "error": { "code", "message", "details?" } }`. Full contract in `CLAUDE.md` §6–7.

`400 VALIDATION_ERROR` puts per-field messages in `details.<field>` and whole-body problems (empty body, unknown keys) in `details._form`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Liveness check. `200 { status: "ok", uptime }` |
| POST | `/auth/register` | none | Body `{ email, password (8–72), name, phone? (E.164) }`. `201 { user, accessToken }` + sets `refresh_token` cookie. `409 EMAIL_TAKEN \| PHONE_TAKEN`, `400 VALIDATION_ERROR` |
| POST | `/auth/login` | none | Body `{ email, password }`. `200 { user, accessToken }` + sets cookie. `401 INVALID_CREDENTIALS`, `403 ACCOUNT_BANNED` |
| POST | `/auth/refresh` | cookie | Rotates the refresh cookie. `200 { user, accessToken }`. `401 INVALID_REFRESH_TOKEN` (cookie cleared; reusing an old token revokes all the user's sessions) |
| POST | `/auth/logout` | cookie | Revokes the session and clears the cookie. Always `204` |
| POST | `/auth/phone/send-code` | Bearer | Body `{ phone (E.164) }`. Sends a 6-digit code (10 min). `200 { sentTo, expiresInSec, resendAfterSec }`. `429 CODE_RECENTLY_SENT` (details `retryAfterSec`; 60 s cooldown), `429 TOO_MANY_CODES` (5/hour), `409 PHONE_TAKEN` (verified on another account), `409 PHONE_ALREADY_VERIFIED`, `503 SMS_UNAVAILABLE` (production, until Tier 2) |
| POST | `/auth/phone/verify` | Bearer | Body `{ phone, code (6 digits) }`. Only the latest code for that number counts. `200 { user }` with `phone` set and `phoneVerified: true`. `400 INVALID_CODE` (details `attemptsLeft`), `400 CODE_EXPIRED`, `400 NO_ACTIVE_CODE`, `429 TOO_MANY_ATTEMPTS` (5 wrong → request a new code), `409 PHONE_TAKEN` |
| GET | `/me` | Bearer | `200 { user, helperProfile }`. `user` adds `trustedContactPhone`, `isSuspended`. `helperProfile` is `null` until first `PATCH /me/helper`, else `{ skills, isAvailable, verificationStatus, updatedAt }` |
| PATCH | `/me` | Bearer | Body: any of `{ name (2–80), photoUrl (https URL \| null), trustedContactPhone (E.164 \| null) }`, at least one; unknown keys rejected. `200 { user }` |
| PATCH | `/me/helper` | Bearer | Body: any of `{ skills: SKILLS[], isAvailable: boolean }`, at least one; duplicates removed. Creates the profile on first call. Going available sets `lastSeenAt`. `200 { helperProfile }`. `400 SKILLS_REQUIRED` (available with no skills), `403 ACCOUNT_SUSPENDED` (suspended/banned user going available) |
| POST | `/sos` | Bearer | Body `{ type: SOS_TYPES, lat (−90..90), lng (−180..180), accuracyM (≥0), description? (≤500), photoUrl? (https) }`; unknown keys rejected. Creates an `OPEN` SOS. `201 { sos }`. `403 PHONE_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`, `409 ACTIVE_SOS_EXISTS` (already has one `OPEN`/`ACCEPTED`/`EN_ROUTE`/`ARRIVED`; details `{ activeSosId, status }` so the client can open it), `429 SOS_DAILY_LIMIT` (3 created in the last 24 h, any status) |
| GET | `/sos/:id` | Bearer | `200 { sos }` — see *SOS object*. `404 SOS_NOT_FOUND`, `400` if `id` is not a UUID |
| POST | `/sos/:id/cancel` | Bearer | Body `{ reason? (≤200) }`. Requester may cancel while `OPEN`/`ACCEPTED`; the assigned helper while `ACCEPTED`/`EN_ROUTE`. Sets `CANCELLED`, `cancelledAt`, `cancelledBy`, `cancelReason`. `200 { sos }` (see *SOS object*, plus `cancelledBy: "REQUESTER" \| "HELPER"`). `403 NOT_YOUR_SOS`, `409 SOS_NOT_CANCELLABLE` (already resolved/cancelled, helper arrived, or — for the requester — helper already en route), `404 SOS_NOT_FOUND` |

## Auth

- **Access token**: JWT, 15 min, sent as `Authorization: Bearer <token>`. Keep it in memory, not localStorage.
- **Refresh token**: JWT, 7 days, httpOnly cookie `refresh_token` on path `/auth` (`SameSite=None; Secure` in production). The client must call it with `withCredentials: true`.
- Protected routes answer `401` with `AUTH_REQUIRED` (no/invalid header), `TOKEN_EXPIRED` (call `/auth/refresh` and retry) or `INVALID_TOKEN` (log in again).
- Phone codes are logged by the server instead of sent while `NODE_ENV` is not `production` (look for `[SMS stub]` in the server output).
- Refresh tokens rotate on every use. Run only one refresh at a time on the client (share one in-flight promise), or concurrent refreshes will look like token theft and log the user out.

## SOS object

```json
{
  "id": "uuid", "type": "MEDICAL", "description": "…", "photoUrl": null, "status": "OPEN",
  "createdAt": "…", "acceptedAt": null, "enRouteAt": null, "arrivedAt": null, "resolvedAt": null, "cancelledAt": null,
  "requester": { "id": "uuid", "name": "…", "photoUrl": null, "ratingAvg": 0, "ratingCount": 0 },
  "location": { "precision": "EXACT", "lat": 32.08534, "lng": 34.78176, "accuracyM": 14 }
}
```

`location` depends on who is asking (CLAUDE.md §4 privacy):

- **Requester**, or the **assigned helper while `ACCEPTED` / `EN_ROUTE` / `ARRIVED`**: `{ precision: "EXACT", lat, lng, accuracyM }`.
- **Everyone else**, including the helper after `RESOLVED` / `CANCELLED`: `{ precision: "APPROXIMATE", lat, lng, radiusM: 1000 }`, snapped to a 0.01° grid (the true point is within ~800 m). Draw it as a circle, not a pin.

The requester's email, phone and other private fields are never included.
