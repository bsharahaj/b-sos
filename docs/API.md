# B SOS API

All JSON. Errors: `{ "error": { "code", "message", "details?" } }`. Full contract in `CLAUDE.md` §6–7.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Liveness check. `200 { status: "ok", uptime }` |
