# API contract

Base URL: `EXPO_PUBLIC_API_URL`, for example `https://mangapulse.example.com/api/v1`.
All authenticated calls send `Authorization: Bearer <access_token>`.
Types live in `src/api/types.ts` and mirror `backend/app/schemas` in MangaPulse.

## Existing endpoints used (no backend change except bearer support)

| Method | Path | Used by |
|---|---|---|
| POST | `/auth/register` | Register |
| GET | `/auth/me` | Session check |
| POST | `/auth/change-password` | Settings (planned) |
| POST | `/auth/forgot-password` | Login (planned) |
| GET | `/tracked-manga` | Library, title detail |
| GET | `/tracked-manga/stats` | Settings |
| GET | `/tracked-manga/recent-chapters` | Updates |
| POST | `/tracked-manga/from-source` | Search → Track |
| PATCH | `/tracked-manga/{id}` | Progress, status, notification toggle |
| DELETE | `/tracked-manga/{id}` | Remove |
| GET | `/manga/search?q=&source=` | Search |
| GET | `/notifications` | Alerts |
| GET | `/notifications/unread-count` | Tab badge |
| PATCH | `/notifications/{id}/read`, `/notifications/read-all` | Alerts |
| DELETE | `/notifications/read` | Alerts (planned) |

**Bearer support:** every endpoint above accepts `Authorization: Bearer <access_token>` (implemented in MangaPulse `feat/mobile-auth`). A bearer header takes precedence and, if sent, must be valid.

## Mobile auth endpoints (implemented in MangaPulse `feat/mobile-auth`)

### `POST /auth/mobile/login`

Request
```json
{ "email": "you@example.com", "password": "…", "device_name": "Pixel 8" }
```
Response `200`
```json
{
  "access_token": "<jwt>",
  "refresh_token": "mpr_…",
  "token_type": "bearer",
  "expires_in": 900,
  "user": { "id": 1, "full_name": "…", "email": "…", "role": "user", "is_active": true,
            "created_at": "…", "updated_at": "…", "features": [] }
}
```
Errors: `401` bad credentials (identical body for unknown email and wrong password), `422` invalid input, `429` too many failures for this account (`Retry-After` header) or per-IP limit (10/min). No cookie is set.

### `POST /auth/mobile/refresh`

Request `{ "refresh_token": "mpr_…" }` → same body as login. The presented token is retired and a new one issued.
Errors: `401` unknown, expired, revoked or reused token; `422` malformed token; `429` (30/min per IP).

Semantics the client relies on:
- **Retry window:** presenting a just-rotated token again within 10 seconds succeeds (and returns a fresh pair). This covers a response lost on a bad connection.
- **Reuse:** presenting a rotated token after that window is treated as theft: the whole session is revoked and every call returns `401` until the user signs in again.
- Sessions end at 30 days without use, and at 90 days regardless of use.

### `POST /auth/mobile/logout`

Request `{ "refresh_token": "mpr_…" }` → `200 { "message": "…" }`. **Needs no access token**: possession of the refresh token authenticates it, so it works after the access token expired. Ends that session immediately, including its live access tokens. Idempotent; an unknown token also returns `200`.

### Events that sign the app out

Changing or resetting the password on any client ends all mobile sessions (`401` on the next call). Signing in on an 11th device ends the least recently used session.

### `POST /devices`

Request
```json
{ "expo_push_token": "ExponentPushToken[xxxx]", "platform": "android", "device_name": "Pixel 8" }
```
Response `201`
```json
{ "id": 12, "platform": "android", "device_name": "Pixel 8", "created_at": "…" }
```
Idempotent on `(user_id, expo_push_token)`: re-registering returns the existing row. If the token belongs to another user it is moved to the caller.

### `DELETE /devices/{id}`

`204`. `404` if the device does not belong to the caller.

### Push payload (server → Expo → device)

```json
{
  "to": "ExponentPushToken[xxxx]",
  "title": "One Piece",
  "body": "Chapter 1130 is out",
  "channelId": "new-chapters",
  "data": { "type": "new_chapter", "manga_id": 7, "notification_id": 301, "chapter_url": "https://…" }
}
```
