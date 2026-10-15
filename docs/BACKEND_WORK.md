# Backend work in MangaPulse

Items 1–2 are required before Mangly can sign in; item 3 is optional (instant push).

| # | Item | Status |
|---|---|---|
| 1 | Bearer support in `get_current_user` | **Done**, MangaPulse branch `feat/mobile-auth` (commit "Accept bearer tokens in get_current_user") |
| 2 | Refresh tokens and `/auth/mobile/*` | **Done**, same branch (commit "Add mobile sign-in with rotating refresh tokens"). Not yet merged or deployed |
| 3 | Devices and push delivery | Not needed for now (optional, for instant push) |

The sections below are the original specification. Where the implementation differs, the differences are listed here:

- Logout is authenticated by the refresh token and needs no access token.
- A 10 second reuse leeway was added so a lost refresh response followed by a retry does not sign the user out (`MOBILE_REFRESH_REUSE_LEEWAY_SECONDS`).
- Access tokens carry the session id (`fid`), so logout and reuse detection invalidate them immediately instead of at expiry.
- Sessions have a 90 day absolute lifetime and a cap of 10 per account.
- `verify_password` now returns `False` for input over 72 bytes (bcrypt 5 raised, which was a 500 on the web login as well).

## 1. Bearer support in `get_current_user`

`backend/app/api/deps.py`

- Accept `Authorization: Bearer <jwt>` in addition to the `access_token` cookie. Cookie stays the web path; header wins if both are present.
- Reuse the existing checks unchanged: `decode_access_token`, `is_token_revoked(jti)`, `is_active`, `token_version`.

Acceptance
- Existing web tests pass untouched.
- New tests: valid bearer → 200; revoked `jti` → 401; stale `tv` → 401; no credentials → 401.

## 2. Refresh tokens and `/auth/mobile/*`

New table `refresh_tokens` (Alembic migration, backward compatible):

| Column | Notes |
|---|---|
| `id` | PK |
| `user_id` | FK, indexed |
| `family_id` | UUID; all rotations of one login share it |
| `token_hash` | SHA-256 of the opaque token; the raw token is never stored |
| `device_name` | optional |
| `created_at`, `expires_at`, `revoked_at`, `replaced_by_id` | rotation bookkeeping |

Endpoints: `/auth/mobile/login`, `/auth/mobile/refresh`, `/auth/mobile/logout` (see `API_CONTRACT.md`).

Rules
- Access token: existing JWT, **15 minute** lifetime for mobile (web stays 60). Refresh token: 32 random bytes (`secrets.token_urlsafe`), **30 day** lifetime.
- Refresh rotates: the presented token is marked replaced and a new one issued in the same family.
- Presenting a token that is already replaced or revoked revokes the **entire family** and returns 401.
- Password change and password reset revoke all of the user's refresh tokens (same event that bumps `token_version`).
- Rate limit by account (email) as well as by IP.
- Login failures use the same response and timing as the web endpoint.

Acceptance
- Tests for rotation, reuse detection, expiry, logout, and password-change revocation.
- A daily Celery Beat task deletes refresh tokens expired more than 7 days ago.

## 3. Devices and push delivery (optional: not used by the app today)

> The app currently gets new-chapter notifications from a background check on the phone and needs none of this. This section is the design for instant server push, should it be wanted later (see `ARCHITECTURE.md`).

New table `devices`: `id`, `user_id` (FK, indexed), `expo_push_token` (unique), `platform`, `device_name`, `created_at`, `last_seen_at`.

- `POST /devices`, `DELETE /devices/{id}` per `API_CONTRACT.md`.
- Validate the token format (`ExponentPushToken[...]` / `ExpoPushToken[...]`) before storing.
- In the notification task that creates a `Notification` row, enqueue `send_push(notification_id)` **only when a row was newly created**, so cross-source de-duplication also applies to push.
- `send_push` batches up to 100 messages per request to `https://exp.host/--/api/v2/push/send`, honours `notifications_enabled` per tracked title, and skips users with no devices.
- Read push receipts after ~15 minutes; delete devices that report `DeviceNotRegistered`.
- Config: `ENABLE_PUSH_NOTIFICATIONS` (default off), `EXPO_ACCESS_TOKEN` (optional, enables Expo enhanced security).

Acceptance
- With push disabled nothing changes for existing deployments.
- Unit tests with a mocked Expo endpoint: one push per new chapter across two sources; invalid-token cleanup; per-title opt-out.

## 4. Deployment notes

- Mobile traffic arrives through the same reverse proxy; keep `TRUSTED_PROXY_COUNT` correct so IP limits are meaningful.
- Terminate TLS at the proxy. The app refuses cleartext in release builds.
- Run `prod-migrate` before `prod-up`; both new tables are additive.

## Suggested order

1 → 2 → 3. After 2 lands, Mangly can sign in and use every screen except push.
