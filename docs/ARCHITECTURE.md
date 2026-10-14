# Mangly architecture

## Decisions

| # | Decision | Reason | Trade-off |
|---|---|---|---|
| 1 | Mangly is a thin client of the MangaPulse API | One source of truth for scraping, de-duplication and notification logic | App depends on backend availability; no offline writes |
| 2 | Extend MangaPulse in place (no fork) | Avoids two diverging backends | Mobile auth ships through MangaPulse's release cycle |
| 3 | Expo / React Native, TypeScript | Reuses TanStack Query, zod and the API types from the web frontend | Native modules need development builds, not Expo Go |
| 4 | Bearer + refresh tokens instead of cookies | The web session is an `HttpOnly`, `SameSite=Strict` cookie; native clients have no cookie jar contract | New token endpoints and a revocation store on the backend |
| 5 | Expo Push Service for delivery | One server call covers FCM; no Firebase SDK code in the backend | Third-party hop (`exp.host`); notification content passes through Expo |

## Layout

```
src/
  app/            Expo Router routes (screens only)
    (auth)/       login, register
    (tabs)/       library, updates, search, notifications, settings
    manga/[id]    title detail
  api/            fetch client, endpoint functions, response types
  auth/           token storage, AuthProvider
  push/           permission, token fetch, backend registration
  components/     shared UI
  theme.ts        light/dark tokens
```

Screens contain no networking code. They call functions in `src/api/endpoints.ts` through TanStack Query.

## Authentication

```
Login     POST /auth/mobile/login  {email, password, device_name}
          -> {access_token (15 min), refresh_token (30 days), user}
Request   Authorization: Bearer <access_token>
401       POST /auth/mobile/refresh {refresh_token}  -> new pair (rotation)
          retry the original request once
Logout    POST /auth/mobile/logout {refresh_token}   -> revoke
```

- The **access token is memory-only**. The **refresh token** is stored in `expo-secure-store` (Android Keystore).
- Concurrent 401s share **one** refresh call. The server rotates refresh tokens, so a parallel second use would be indistinguishable from token replay.
- Refresh failures are handled by cause: a 401/403 from the server ends the session; a network error keeps the stored token so a tunnel or airplane mode does not log the user out.
- The backend must treat reuse of an already-rotated refresh token as theft and revoke that token family (see `BACKEND_WORK.md`).
- Android backup is disabled (`allowBackup: false`) so credentials never leave the device through backup.

## Push notifications

```
App start (signed in)  -> permission -> getExpoPushTokenAsync -> POST /devices
Backend (Celery)       -> new chapter detected -> existing notification row created
                       -> for each of the user's devices: POST https://exp.host/--/api/v2/push/send
Device                 -> notification tap -> app opens (chapter link in data payload)
Logout                 -> DELETE /devices/{id}
```

- One push per chapter per user, not per source. Sending hooks into the same place that already de-duplicates in-app notifications.
- The backend removes a device when Expo returns `DeviceNotRegistered`.
- Payload carries IDs and a chapter URL only. No tokens, no email.

## Security notes

| Risk | Control |
|---|---|
| Token theft from device storage | Refresh token in Keystore; access token never persisted; backup off |
| Refresh token replay | Rotation + reuse detection (backend) |
| Cleartext traffic | Release builds require `https://`; `10.0.2.2` HTTP is for local development only |
| Password change | Backend already bumps `token_version`; refresh tokens must be revoked on the same event |
| Per-IP rate limits and carrier NAT | Mobile endpoints need per-account limits in addition to per-IP (backend) |
| Push token as an identifier | Treat as a secret per device; unregister on logout; drop on `DeviceNotRegistered` |

## Out of scope for the first release

iOS, offline reading queue, in-app chapter reader (chapters open in the system browser tab), AI recommendations, admin screens.
