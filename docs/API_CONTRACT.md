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

**Prerequisite:** `get_current_user` currently reads only the `access_token` cookie. It must also accept `Authorization: Bearer`.

## New endpoints

### `POST /auth/mobile/login`

Request
```json
{ "email": "you@example.com", "password": "…", "device_name": "Pixel 8" }
```
Response `200`
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<opaque>",
  "token_type": "bearer",
  "expires_in": 900,
  "user": { "id": 1, "full_name": "…", "email": "…", "role": "user", "is_active": true,
            "created_at": "…", "updated_at": "…", "features": [] }
}
```
Errors: `401` bad credentials (same message as web), `429` rate limited.

### `POST /auth/mobile/refresh`

Request `{ "refresh_token": "<opaque>" }` → same body as login (new pair; the old refresh token is invalidated).
Errors: `401` unknown, expired, revoked or **reused** token (reuse revokes the whole family).

### `POST /auth/mobile/logout`

Request `{ "refresh_token": "<opaque>" }` (authenticated) → `{ "message": "…" }`. Revokes that refresh token and the access token's `jti`.

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
