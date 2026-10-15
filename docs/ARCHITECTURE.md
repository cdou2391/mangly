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
    (tabs)/       library, updates (alerts + new chapters), search, settings
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

## Updates feed (alerts and new chapters merged)

The Updates tab replaces the former Alerts tab. Two server lists describe the same releases differently, so the app merges them (`src/utils/feed.ts`, `useUpdatesFeed`):

- `GET /notifications`: one row per chapter, kept as history, with a read flag. Only exists for titles with notifications on.
- `GET /tracked-manga/recent-chapters`: the single latest chapter per tracked title, "new" when it is past the reading progress.

Rules: a chapter appears once (alerts win, matched by chapter number); the latest chapter of titles without an alert is added; an alert is unread only while the title's progress has not passed it, so the feed, the tab badge and the Library bell always agree. Alerts for titles no longer tracked are dropped.

Reading: a chapter backed by an alert is saved with `PATCH /notifications/{id}/read` (the server moves progress forward itself); any other chapter is saved with `PATCH /tracked-manga/{id}`. Older alerts of the same title are then marked read. "Mark all read" moves every new title to its latest chapter and calls `PATCH /notifications/read-all` (which, server side, only flips the flags), so the app updates progress itself and asks for confirmation first.

## Staying signed in

| Token | Lifetime | Where |
|---|---|---|
| Access token | 15 minutes | memory only |
| Refresh token | 30 days, renewed (rotated) on every use | Android Keystore |
| Hard cap per login | 90 days (`MOBILE_REFRESH_MAX_AGE_DAYS`) | server |

At launch, while the splash is showing, the app renews the stored session (`restoreSession` in `src/api/client.ts`, driven by `AuthProvider`):

- **accepted:** straight to the Library;
- **refused (401/403, or any other 4xx that means the token can never work):** the session is dropped and the user goes to Log In;
- **no answer (offline, timeout, 5xx, 429):** the token is kept and the user stays signed in. With a recent offline copy (next section) the app opens straight into the Library on it; without one it shows "Can't reach MangaPulse" instead of the login form, retries by itself (5 s, 10 s, 20 s, then every 30 s) and straight away when the app returns to the foreground, and moves on as soon as the server answers. The splash waits at most 8 s.

A renewal that times out is retried once immediately with the same token: the server may have rotated it without the reply arriving, and it accepts the old token again for a few seconds (`MOBILE_REFRESH_REUSE_LEEWAY_SECONDS`). That is why the renewal timeout (8 s) is shorter than the ordinary request timeout (20 s).

## Working offline (read-only)

The app can be opened and read when the server cannot be reached. It is a copy, not a second source of truth: the server stays the only place anything is written.

| | |
|---|---|
| What is kept | The Library list, the latest chapters and the alerts (query keys `tracked`, `recent-chapters`, `notifications`), plus the signed-in user. Search is online-only. Cover images are kept by `expo-image`'s own disk cache, so covers already seen still show. |
| Where | One file, `mangapulse-cache.json`, in the app's private document directory (`src/cache/store.ts`). Backups are off (`allowBackup: false`). It holds the user's email and library, not tokens; the refresh token stays in the Keystore. |
| When it is saved | A second after the data last changed, and when the app goes to the background. Nothing is saved until the server has answered once, so a fresh sign-in never saves an empty copy. |
| When it is shown | Only when the session cannot be checked with the server at launch (offline, timeout, 5xx, 429), or the server was reached but renewing the session failed for a non-permanent reason. On a normal launch the server's answer wins; the copy is shown meanwhile and refreshed. |
| How long it lives | Until sign-out (or the server refusing the session), **but never more than 7 days since the server last answered** (`MAX_AGE_MS`). Past that the copy is ignored and the app insists on a fresh answer: "Can't reach MangaPulse" until the server is reached. Edits and failed refreshes do not make a copy look newer; only a real answer from the server does. |
| Whose it is | The copy records its user. A different user signing in deletes it. Sign-out, a refused session and "no token stored" delete it and empty the in-memory query cache. |

**Offline behaviour.** The user goes straight in: no banner, no offline screen. The only indicator is **Settings → Connection: Online / Offline**, driven by `src/api/reachability.ts`, which every request updates (a reply of any kind is online; a network failure, a timeout or a 502/503/504 from the proxy is offline). While offline the app pings `/health` (5 s, 10 s, 20 s, then every 30 s, and on returning to the foreground). When the server answers it goes back to Online, everything on screen is refetched, and the first request renews the session as usual.

**Writes are never queued.** Changing a status, toggling alerts, removing a title, marking chapters read and adding from Search all go to the server. If it cannot be reached the request fails with "Can't reach MangaPulse. Check your connection and try again later." (a toast for marking read, an inline message elsewhere) and the screen goes back to what it was. Signing out while offline signs out on the device (the copy and token are deleted); the server-side session is not revoked and expires on its own.

**Known limits.** An optimistic edit that is saved to disk a second before the app is killed offline can survive as the saved state until the next refresh. A user who is offline for more than 7 days must reach the server once before the app opens.
