# Mangly architecture

## Decisions

| # | Decision | Reason | Trade-off |
|---|---|---|---|
| 1 | Mangly is a thin client of the MangaPulse API | One source of truth for scraping, de-duplication and notification logic | App depends on backend availability; no offline writes |
| 2 | Extend MangaPulse in place (no fork) | Avoids two diverging backends | Mobile auth ships through MangaPulse's release cycle |
| 3 | Expo / React Native, TypeScript | Reuses TanStack Query, zod and the API types from the web frontend | Native modules need development builds, not Expo Go |
| 4 | Bearer + refresh tokens instead of cookies | The web session is an `HttpOnly`, `SameSite=Strict` cookie; native clients have no cookie jar contract | New token endpoints and a revocation store on the backend |
| 5 | New-chapter notifications come from a background check on the phone (WorkManager), not from server push | Needs no Expo or Firebase account and no MangaPulse change: it reads the alerts the server already creates and de-duplicates | Not instant: Android decides when the check runs (every 15 minutes at the soonest, often much later); see "New-chapter notifications" |

## Layout

```
src/
  app/            Expo Router routes (screens only)
    (auth)/       login, register
    (tabs)/       library, updates (alerts + new chapters), search, settings
    manga/[id]    title detail
  api/            fetch client, endpoint functions, response types
  auth/           token storage, AuthProvider
  alerts/         new-chapter notifications: background check, permission, Settings switch
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

## New-chapter notifications

```
Backend (Celery)   -> new chapter found -> one alert row per user and chapter (already de-duplicated; only for titles with alerts on)
Phone (WorkManager)-> every ~15+ min, with network: renew session -> GET /notifications?unread_only=true
                   -> unread alerts newer than the last one seen -> local notification (one each, or a summary past 3)
Tap                -> app opens on Updates
```

- **No server push.** `expo-background-task` (Android WorkManager) wakes the app; `src/alerts/check.ts` does one check; `expo-notifications` shows a local notification. No Expo or Firebase account, no device registry, no backend change.
- **Runs without the app open.** The system starts the app headless, so the task is defined when the bundle loads: `index.ts` (the entry point, `main` in `package.json`) imports `src/alerts/task.ts` before `expo-router/entry`. A test guards both.
- **What counts as new.** `seenId`, the newest alert already shown, kept per user in SecureStore with the on/off choice. A check notifies for unread alerts above it, then advances it. The first check only sets the baseline (the backlog is not news). Alerts loaded from the server while the app is open also advance it, so nothing is announced twice. Alerts already read (including by reading the chapter) never notify. Without permission nothing is shown, and what was missed is not replayed later.
- **Switch.** Settings → Notifications. On first launch with something in the library the app asks for the Android 13+ permission once; the answer is remembered. If the system will not ask again, switching on opens the system settings. Sign-out cancels the check, forgets everything and clears shown notifications; a different user on the device starts fresh.
- **The check never runs while the app is open** (the app shows the alerts itself).
- **Session.** Each check renews the session like a launch does, which rotates the refresh token. A check killed between the server rotating the token and the app saving it could leave a token the server no longer accepts after its 10 s leeway; WorkManager gives a run minutes, so this is rare, and the result would be a sign-in prompt, not data loss.

**Limits to expect.** Android treats the interval as a minimum and batches work: Doze and battery saver can delay checks for hours, some manufacturers stop background work for apps that are not used, and "Force stop" cancels it until the app is opened again. Notifications therefore arrive minutes to hours after a chapter is detected, never instantly.

**If instant delivery is wanted later:** server push through Expo's push service (FCM underneath) needs an Expo account (EAS project id), a Firebase project with FCM credentials, a devices table with `POST /devices` and `DELETE /devices/{id}`, and a sender hooked into the alert creation. It would replace the background check (or run beside it) without changing the alerts model.

## Security notes

| Risk | Control |
|---|---|
| Token theft from device storage | Refresh token in Keystore; access token never persisted; backup off |
| Refresh token replay | Rotation + reuse detection (backend) |
| Cleartext traffic | Release builds require `https://`; `10.0.2.2` HTTP is for local development only |
| Password change | Backend already bumps `token_version`; refresh tokens must be revoked on the same event |
| Per-IP rate limits and carrier NAT | Mobile endpoints need per-account limits in addition to per-IP (backend) |
| Notification state on a shared device | The alerts state (choice, user, `seenId`) is per user and deleted on sign-out; shown notifications are dismissed on sign-out |

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

## Popular on MangaPulse (suggestions for a new library)

An empty library is a dead end, so the Library shows a rail of titles other readers follow, under the empty message.

- **Source:** `GET /manga/popular?limit=10` (MangaPulse). Ranked by the number of active readers who follow a title and have not dropped it; it leaves out titles the caller already follows and titles with nothing to scrape. It returns the manga `id`, the card fields and a reader count, never who the readers are. No AI, no quota.
- **When:** only while the library has fewer than 3 titles (`SPARSE_LIBRARY`), and only after the library itself has loaded, so an established user never makes the request.
- **Track:** the card's Track button calls the existing `POST /tracked-manga` with the `id`. The card leaves the rail at once and the library refreshes; "already followed" (409) counts as done; a failure keeps the card (button reads "Try again") with an Android toast. At 3 titles the rail goes away.
- **It is a suggestion, not a feature to depend on:** offline, on any error, or with nothing to suggest, there is no rail and no error message. It is not part of the offline copy.
