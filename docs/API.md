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
| GET | `/me` | Bearer | `200 { user, helperProfile }`. `user` adds `trustedContactPhone`, `isSuspended`. `helperProfile` is `null` until first `PATCH /me/helper`, else `{ skills, isAvailable, verificationStatus, updatedAt }` |
| PATCH | `/me` | Bearer | Body: any of `{ name (2–80), photoUrl (https URL \| null), trustedContactPhone (E.164 \| null) }`, at least one; unknown keys rejected. `200 { user }` |
| PATCH | `/me/helper` | Bearer | Body: any of `{ skills: SKILLS[], isAvailable: boolean }`, at least one; duplicates removed. Creates the profile on first call. Going available sets `lastSeenAt`. `200 { helperProfile }`. `400 SKILLS_REQUIRED` (available with no skills), `403 ACCOUNT_SUSPENDED` (suspended/banned user going available) |

## Auth

- **Access token**: JWT, 15 min, sent as `Authorization: Bearer <token>`. Keep it in memory, not localStorage.
- **Refresh token**: JWT, 7 days, httpOnly cookie `refresh_token` on path `/auth` (`SameSite=None; Secure` in production). The client must call it with `withCredentials: true`.
- Protected routes answer `401` with `AUTH_REQUIRED` (no/invalid header), `TOKEN_EXPIRED` (call `/auth/refresh` and retry) or `INVALID_TOKEN` (log in again).
- Refresh tokens rotate on every use. Run only one refresh at a time on the client (share one in-flight promise), or concurrent refreshes will look like token theft and log the user out.
