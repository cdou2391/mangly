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
    change-password, stats   pushed from Settings
    mood             pushed from the Library (accounts with the mood feature)
  api/            fetch client, endpoint functions, response types
  auth/           token storage, AuthProvider
  alerts/         new-chapter notifications: background check, permission, Settings switch
  export/         writes the library to a file and opens the share sheet
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
Tap                -> one chapter: Updates, then the chapter itself (marked read); a summary: Updates
```

- **No server push.** `expo-background-task` (Android WorkManager) wakes the app; `src/alerts/check.ts` does one check; `expo-notifications` shows a local notification. No Expo or Firebase account, no device registry, no backend change.
- **Runs without the app open.** The system starts the app headless, so the task is defined when the bundle loads: `index.ts` (the entry point, `main` in `package.json`) imports `src/alerts/task.ts` before `expo-router/entry`. A test guards both.
- **What counts as new.** `seenId`, the newest alert already shown, kept per user in SecureStore with the on/off choice. A check notifies for unread alerts above it, then advances it. The first check only sets the baseline (the backlog is not news). Alerts loaded from the server while the app is open also advance it, so nothing is announced twice. Alerts already read (including by reading the chapter) never notify. Without permission nothing is shown, and what was missed is not replayed later.
- **Switch.** Settings → Notifications. On first launch with something in the library the app asks for the Android 13+ permission once; the answer is remembered. If the system will not ask again, switching on opens the system settings. Sign-out cancels the check, forgets everything and clears shown notifications; a different user on the device starts fresh.
- **The check never runs while the app is open** (the app shows the alerts itself).
- **Session.** Each check renews the session like a launch does, which rotates the refresh token. A check killed between the server rotating the token and the app saving it could leave a token the server no longer accepts after its 10 s leeway; WorkManager gives a run minutes, so this is rare, and the result would be a sign-in prompt, not data loss.

**Tapping a notification.** A notification for one chapter carries which alert, title, chapter and link it is about (`data` in `plan.ts`). `AlertsEffects` opens Updates (so that is what is under the browser when the reader comes back) and then the chapter through the same `useOpenChapter` as a row of the feed: the page opens at once and the alert is marked read, which moves reading progress forward. With no usable link (only `http(s)` links are accepted, everything else is dropped) the title's page opens instead, found through the library list; a summary ("5 new chapters"), a test notification and a notification from an older version of the app only open Updates.

**Seeing that it works (Settings → Notifications, when on).** The background check writes its own status, because it runs while the app is closed (`lastCheck` and `delays` next to `seenId` in the saved state; an older saved state without them still reads fine).
- **Last check:** "12 min ago · nothing new" / "2 notifications shown" / "no connection" / "couldn't show it" / "blocked in system settings". A check that was skipped (alerts off, app open) is never recorded, so the line never claims a look that did not happen. Older than 6 hours, it reads "later than expected" in the alert colour. The screen re-reads it whenever it is shown or the app returns to the front.
- **Alert delay:** the middle value of how many minutes passed between MangaPulse creating each of the last 20 alerts shown and the phone showing it (from the alert's `created_at`). It appears from the third alert. It does not include the time between a chapter being published and MangaPulse finding it (the server scans hourly), so it measures only the phone's part; use it to judge whether server push would be worth building.
- **Recent alerts (Settings → Notifications → Recent alerts):** the last 10 chapters this phone showed a notification for, newest first, each with **Found** (the alert's `created_at`: when MangaPulse's scan added the chapter and created the alert) and **Notified** (when the background check showed the notification on the phone), plus the gap between them. Written by the background check to its own SecureStore value (`mangly.alerts.history`, kept under the 2 KB limit by clipping names; read on the screen's open), one entry per chapter even when many arrived as a single summary notification. Not recorded: alerts you saw in the app (no notification was sent), blocked or failed notifications. Cleared on sign-out. Neither time is when the *site* posted the chapter, which the app does not know; the scan runs hourly, so Found can trail the site by up to about an hour.
- **Send a test notification** shows one like a real one (tapping it opens Updates), or says that notifications are blocked and opens the system settings.
- **Alerts arriving late?** explains the two delays (the server's hourly scan; Android's own scheduling, longer in Doze or battery saver) and opens the app's settings page so battery use can be set to Unrestricted.

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
| What is kept | The Library list, the latest chapters and the alerts (query keys `tracked`, `recent-chapters`, `notifications`), the recommendations at the top (`home-picks`), plus the signed-in user. Search is online-only. Cover images are kept by `expo-image`'s own disk cache, so covers already seen still show. |
| Where | One file, `mangapulse-cache.json`, in the app's private document directory (`src/cache/store.ts`). Backups are off (`allowBackup: false`). It holds the user's email and library, not tokens; the refresh token stays in the Keystore. |
| When it is saved | A second after the data last changed, and when the app goes to the background. Nothing is saved until the server has answered once, so a fresh sign-in never saves an empty copy. |
| When it is shown | Only when the session cannot be checked with the server at launch (offline, timeout, 5xx, 429), or the server was reached but renewing the session failed for a non-permanent reason. On a normal launch the server's answer wins; the copy is shown meanwhile and refreshed. |
| How long it lives | Until sign-out (or the server refusing the session), **but never more than 7 days since the server last answered** (`MAX_AGE_MS`). Past that the copy is ignored and the app insists on a fresh answer: "Can't reach MangaPulse" until the server is reached. Edits and failed refreshes do not make a copy look newer; only a real answer from the server does. |
| Whose it is | The copy records its user. A different user signing in deletes it. Sign-out, a refused session and "no token stored" delete it and empty the in-memory query cache. |

**Offline behaviour.** The user goes straight in: no banner, no offline screen. The only indicator is **Settings → Connection: Online / Offline**, driven by `src/api/reachability.ts`, which every request updates (a reply of any kind is online; a network failure, a timeout or a 502/503/504 from the proxy is offline). While offline the app pings `/health` (5 s, 10 s, 20 s, then every 30 s, and on returning to the foreground). When the server answers it goes back to Online, everything on screen is refetched, and the first request renews the session as usual.

**Writes are never queued.** Changing a status, toggling alerts, removing a title, marking chapters read and adding from Search all go to the server. If it cannot be reached the request fails with "Can't reach MangaPulse. Check your connection and try again later." (a toast for marking read, an inline message elsewhere) and the screen goes back to what it was. Signing out while offline signs out on the device (the copy and token are deleted); the server-side session is not revoked and expires on its own.

**Known limits.** An optimistic edit that is saved to disk a second before the app is killed offline can survive as the saved state until the next refresh. A user who is offline for more than 7 days must reach the server once before the app opens.

## Home hero (recommendations)

The top of the Library is a full-width banner of recommended titles, swiped sideways one title per page, with the new-chapters section under it. Each page is the cover edge to edge with the title inside it, a label (**SIMILAR** or **POPULAR**), a Track button, and page dots under the banner.

- **Source:** one request, `GET /manga/home-picks?limit=8` (MangaPulse). The server alternates *similar* picks (genre overlap with the reader's best-rated, most recently touched titles, two picks per seed, up to two seeds; labelled "Because you read X") with *popular* ones (most followed by other active readers). Never what the reader already follows, never a title with nothing to scrape, and every pick has a manga id. A reader with no library gets popular only. It is free: no AI, no quota. (`/manga/popular`, used by an earlier version of the app, is still there.)
- **Track:** the card's Track button calls the existing `POST /tracked-manga` with the `id`. The card leaves the hero at once, the library refreshes and the picks are asked for again (the library changed, so what is similar to it has too). "Already followed" (409) counts as done; a failure keeps the card (button reads "Try again") with an Android toast.
- **Everyone, not only new readers.** Pull to refresh asks for new picks.
- **Built to survive Android.** The banner is a plain paging `ScrollView` (one screen width per page, `nestedScrollEnabled` because it sits inside the Library's vertical list), not a virtualized list with snapping arithmetic; and the Library list sets `removeClippedSubviews={false}`. Android detaches the off-screen views of a virtualized list to save memory, and with lists nested in the header that can leave the banner missing or blank when the content above it changes height (a new-chapter row appearing, for example). A test pins each of these settings, since the browser preview cannot show this failure.
- **Never blank.** The last picks are part of the offline copy (see below), so the hero is still there offline, after a restart, and when a refresh fails; a failed refresh never replaces picks that are already on screen. With nothing to show (everything followed, the server has no endpoint yet, or it could not be reached and nothing was saved) the banner is an invitation, "Find your next read", with a Search button. While the picks are still being asked for it shows nothing, so one banner is never swapped for another. No error message is ever shown for it. A saved pick that was followed elsewhere is harmless: Track answers 409, which counts as done.

- **Continue reading.** Before the recommendations, up to three **CONTINUE** pages (`utils/continueReading.ts`): titles with status *Reading* that are started and have chapters left, most recently touched first, each saying "Next up: Ch. 24" and "You're on Ch. 23 · 22 chapters to go". They are built on the phone from the Library list (no request, nothing new to save, so they work offline and appear as soon as the list does). **Limit:** the server knows the newest and first chapter links only, not the one after the last read, and a chapter link cannot be guessed (some sites link by id). So the button opens the page of the *last chapter read* (the saved `last_chapter_url`, unless it plainly names another chapter; the same rule as the title page's Continue reading), where the site's own "next" button goes on; without a trustworthy link it reads "Open" and goes to the title. Opening never changes progress. A true next-chapter link would need a server-side lookup (parked).

## Browsing the library (search, filters, sorting, pages)

The Library list under the hero and the new-chapters section can be searched, filtered, sorted and is shown ten titles at a time.

- **All on the phone.** The whole library is already loaded (and kept offline), so everything here runs on it in memory (`src/utils/libraryView.ts`): instant, the same offline, and no request is made. The search is only among titles already added; finding new titles is the Search tab.
- **Search:** a field above the list that narrows it as you type. Case and accents are ignored ("pokemon" finds "Pokémon"), every word typed must appear, in any order, in the title, the author or the title the source site gives it.
- **Filters:** the status chips (All, Reading, Plan, On hold, Done, Dropped, with counts) and an **Unread** chip (titles you are behind on, the ones showing a +N; it stays visible while on so it can be turned off). Status and Unread combine, and narrow the search further.
- **Sorting:** a button beside the search field opens a list of six orders: most unread first (the default), recently updated, recently added, title A to Z, Z to A, highest rated. The choice is remembered between launches (`mangly.library_sort` in secure storage; an unknown saved value means the default).
- **Pages of ten** (`PAGE_SIZE`), with Previous / Next and "Page 2 of 3, 11–20 of 26" under the list; no pager when everything fits on one page. Any change to the search, a filter or the order goes back to page 1, a page that no longer exists (titles removed) becomes the last one, and changing page scrolls back up to the search field.
- **Nothing found:** "No matches" (or "No titles here" for a filter alone) with a button that clears the search and filters.

## Rating a title

The title page has a **YOUR RATING** section: five stars to tap (1 to 5), the rating in words ("4 out of 5" or "Not rated yet"), and **Clear rating** once there is one.

- **Rate / change:** tapping a star saves it (`PATCH /tracked-manga/{id}` with only `{ "rating": n }`); tapping another star changes it.
- **Clear:** "Clear rating" sends `{ "rating": null }`. This needed a MangaPulse change: the API treated every null as "not sent" and so could never remove a rating. Now an explicit `rating: null` removes it, while leaving `rating` out leaves it alone and a null for any other field still means "leave it". Until that is deployed, clearing appears to work and then the rating comes back when the library is read again.
- **Immediate, and put back on failure:** the new rating shows at once; if saving fails (offline, server trouble) it goes back to what it was with the usual "try again later" message, even when the library cannot be re-read. New taps wait while one is being saved.
- The rating feeds the Library's "Highest rated" order, and the server's taste-judging (which needs at least three ratings).

## Setting the chapter by hand

Under the progress bar on the title page, **I'M UP TO CHAPTER** is a number field with a step down and a step up and a **Save** button, for catching up after reading elsewhere or undoing a mistaken "Mark as read".

- **Saves only the chapter:** `PATCH /tracked-manga/{id}` with `{ "last_chapter_read": "650" }` (bare number, decimals allowed: "650.5"; a comma is accepted). Typing keeps digits, one dot or comma; anything else is dropped, and a value that is not a chapter number (or over 99999) disables Save and says so. Save is also disabled while the value equals what is saved.
- **The chapter link:** when the chapter chosen is the latest one, the latest chapter's link is saved with it (`last_chapter_url`), as "Mark as read" does. For any other chapter the link is not sent, because the server cannot clear a saved link (a null means "not sent" for every field but the rating).
- **Continue reading** opens the saved chapter link. Because that link can be left over from before a manual change, it is hidden when the link itself names a different chapter than the one you are on (`urlChapter`, e.g. `/chapter-188/`); links that carry an id instead of a number are trusted. **Open on <site>** opens the title's page on its source site and never changes progress.
- **Immediate, and put back on failure,** like rating: the new chapter and progress bar show at once; if saving fails they go back with the usual message, and the number you typed stays in the field so Save can be pressed again. What is typed lives in the page (`draft`), and goes back to following the saved chapter after any successful save.

## Removing a title (confirmation dialog)

"Remove from library" on a title's page asks first in the app's own `ConfirmDialog` (`components/ConfirmDialog.tsx`), not the system alert: a card centred over a dimmed backdrop with a trash badge, the title's cover, name and "You're on Ch. N", the reminder that updates stop and progress is deleted, and two buttons, **Keep it** (left) and **Remove** (right, in the alert colour). Only **Remove** deletes: a tap on the backdrop, Android's Back button or **Keep it** cancels, and a tap on the card itself does nothing. The same dialog is used for every confirmation: **Sign out** (Settings, and the "can't reach" screen; the cancel button reads *Stay signed in*), **Clear read alerts** and **Mark everything as read** (Updates; the last one is not destructive, so its button is red-brand rather than danger-red). The component is generic (title, message, icon, labels, `destructive`, children). Plain system alerts remain only for notices with a single OK (export failed, notifications blocked, "Alerts arriving late?").

## Tags on the title page

The title page lists the title's tags (its genres, `manga.genres`, as MangaPulse stores them) as chips under a **TAGS** heading, above the summary. They arrive with the library list, so there is no extra request and they work offline. The section is left out when a title has none; blanks and repeats are skipped. Since MangaPulse normalises spellings across the two sites (see its README), the same tag reads the same whichever site the title came from, but titles added before that migration was deployed show the old spellings until it has run.

## Motion when a title opens

Three small, short effects, all built on React Native's own `Animated` with the native driver (no new library, nothing native to rebuild):

- **The screen rises in.** The title page is registered with the native stack's `fade_from_bottom` animation (`app/_layout.tsx`), so it fades up into place and falls back the same way on Back. Other screens keep the platform's default.
- **Its content settles in behind it** (`components/motion/Reveal.tsx`): the cover and name grow from 94% to full size, then the progress and reading buttons, then the rest, each fading and rising 16 points, 90 ms apart, 340 ms each. It plays once when the page first shows; later edits on the page do not replay it.
- **A library row sinks under the finger** (`components/motion/PressScale.tsx`): 97% size while pressed, springing back on release.

**Reduce motion:** with Android's "Remove animations" on (`useReduceMotion`, which also follows the setting changing while the app is open), the content is shown at once and rows do not move. The screen transition is the system's own and follows the same system setting. **Not done:** the cover does not fly from the list into the page (a shared-element transition). On Android that needs the Reanimated library and a native rebuild, and is flaky inside a list nested in a screen; it can be revisited if wanted.

## Motion between screens

- **Switching tabs** (`app/(tabs)/_layout.tsx`): the tab navigator's `shift` animation, so the screens slide a little and fade instead of swapping. The selected tab's icon pops (a small spring from a smaller size) and its red bar grows out from the middle (`components/TabIcon.tsx`). A tab that is already selected when the bar first appears is simply there.
- **Opening a screen** (`app/_layout.tsx`): a title rises up (see above); Change password, Stats, Recent alerts and Pick by mood slide in from the right.
- **Moving between the app, sign-in and the "can't reach" screen** cross-fades, so signing in or out is a change of scene, not a push.
- **No white flash:** the navigator paints its own background behind every screen, and while screens fade or slide that background shows through; its default is white. The app therefore sets the dark background in all four places it can come from: a navigation theme (`ThemeProvider` with `DarkTheme` and the app's `bg`), the tabs' `sceneStyle`, the stack's `contentStyle`, and the root view. Any new navigator needs the same.
- Reduce motion: the tab icon and bar stand still; the screen transitions follow Android's own animation setting.

## Previewing a title before tracking

In Search, tapping a result that is not yet in the library opens a **preview sheet** (a bottom `Modal`) instead of doing nothing; a result already in the library still opens its page.

- **Source:** `GET /manga/details?url=&source=` (`mangaApi.details`, 30 a minute; the server scrapes the site and saves nothing). The sheet shows at once what the search knew (cover, title, author, status), then the site's summary, genres and latest chapter with when it came out. The answer is kept for ten minutes (`useMangaPreview`) and is never retried behind the reader's back: a failure shows a message ("source site may be down", "too fast") with **Try again**.
- **Sites:** a title found on several sites has a chip per site; the sheet starts on the site the results are filtered to, otherwise the first.
- **Tracking from the sheet** (**Track this title**) uses the same `useTrackTitle` as the list, preferring the site being looked at. The tracking state is shared with the list, so afterwards the sheet shows **In your library**, which opens the title.
- Nothing is requested until a result is tapped.

## Exporting the library

Settings → **YOUR DATA** has **Export library as CSV** and **as JSON**.

- **No backend.** The file is built on the phone from the library already loaded (`["tracked"]`, so it works offline) in `src/utils/exportLibrary.ts`: title, author, reading status, rating, last chapter read, latest chapter, status, genres, alerts on/off, source, source link, date added; A to Z. No server ids and no summaries. The JSON also holds the app name, when it was exported and the count.
- **CSV:** UTF-8 with a byte-order mark (so Excel shows accents), CRLF line ends, quoted where needed. Titles come from scraped sites, so a text cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe and cannot run as a spreadsheet formula.
- **Hand-over:** the text is written to `mangapulse-library.csv|json` in the app's private cache and `expo-sharing` opens the system share sheet (save to Files or Drive, mail, a spreadsheet app). The next export replaces the file, and signing out deletes both. An empty library says "Nothing to export" instead of sharing a blank file.

## Changing the password in the app

Settings → ACCOUNT → **Change password** opens a screen with the current password, the new one and a confirmation (each with show/hide). The emailed reset link stays under Help & about for a forgotten password.

- **Checked on the phone first** with the sign-up rules (`passwordProblem` in `auth/registration.ts`: 8 to 72 characters and 72 bytes, a letter and a number), that the new one differs from the current one, and that both new entries match. Every problem is shown at once.
- **Request:** `POST /auth/change-password` `{ current_password, new_password }` (5 a minute). A 400 ("Current password is incorrect.") goes under the current-password field; 429 and server errors get plain wording (`describeError(..., "password")`); offline shows the usual "try again later". Nothing typed is lost on a failure.
- **This device stays signed in.** The server revokes every session, this device's included (it bumps the token version and revokes all mobile refresh tokens). `AuthContext.changePassword` therefore signs in again with the new password straight after the change, which swaps in a fresh session without touching the cached library. If that second step fails (connection lost in between), the device is signed out to the login screen rather than left with a session that fails every request. The success screen says other devices were signed out.

## Clearing read alerts

On Updates, a trash button next to "Mark all read" appears when at least one alert has been read. It asks first ("N alerts you've already read will be removed from your history. Unread chapters and your reading progress are not touched"), then calls `DELETE /notifications/read`.

- Only alerts the server holds as read are deleted (`readAlertCount` in `useUpdatesFeed`). Unread alerts, reading progress and the alerts' effect on the badge are untouched.
- The newest chapter of each title keeps showing: the feed also builds a row from each title's latest chapter, so only older read history disappears.
- Immediate, and put back with the usual toast if the call fails (`useClearReadAlerts`, like the other optimistic writes).

## Reading stats

Settings → YOUR LIBRARY → **All your stats** opens a screen computed entirely on the phone from the loaded library (`src/utils/stats.ts`), so it works offline and needs no backend (the server's `/tracked-manga/stats` only has the status counts, which Settings already derives).

- **Figures:** titles (and how many were added in the last 30 days), chapters read, chapters to catch up (and across how many titles), average rating (one decimal, rated titles only).
- **Charts:** status split (stacked bar and legend), rating counts 5 to 1, the eight most common genres (case and spacing ignored, a genre counted once per title), titles per site, and the three titles furthest behind (tap to open).
- **Caveats:** "chapters read" is the whole part of the chapter number last saved in each title (a title with a label without a number counts 0), so it is a close figure for series numbered from 1, not a count of chapters actually opened. "Behind" ignores titles not started, as the Library does.

## Opening chapters and links

Every link out of the app (chapters, a title's page on its source site, the web app, the password reset page) goes through `openInBrowser` in `src/utils/browser.ts`, which opens Chrome's Custom Tab (not a WebView) with `BROWSER_OPTIONS`:

- **`createTask: false`** keeps the tab in the app's own task, so it does not appear as a separate entry in Android's recent apps and Back returns to the app. The cost: if Android has to end the app's process while the tab is open, the tab closes with it (the default, a separate task through a proxy activity, survives that).
- **Look:** the toolbar takes the app's colours, shows the page title and slides away while scrolling.
- **Warm-up:** the Library, Updates and title screens call `useWarmBrowser`, which starts the browser (`warmUpAsync`) and, on the title page, tells it the latest chapter's link is likely next (`mayInitWithUrlAsync`), so the page opens faster. It is only a hint: it never throws and never delays opening a link.

A real in-app reader (a WebView with the app's own header, or chapter images drawn natively) is deliberately not built; see the discussion of trade-offs (bot checks on the source sites in a WebView, ad handling, security of loading untrusted pages in the app, and the legal side of serving chapter images).

## Pick by mood

A screen of its own (`src/app/mood.tsx`), not part of the Library list: it is an interactive flow (choose, wait for an AI, read the answers) that spends a limited daily allowance, so it is something the reader goes to on purpose rather than something that loads with the home screen. The Library has a small **Pick by mood** row under the recommendations (`MoodEntry`) that opens it.

- **Only for accounts that have it.** The server answers `POST /recommendations/by-mood` with 403 unless the account has the `mood_recommendations` feature (set by an administrator; it arrives in `user.features`). `useFeature` hides the Library row without it, and the screen itself says "not enabled" if reached anyway.
- **Choose and ask.** Eight moods (happy, emotional, adventurous, relaxed, romantic, intense, epic, thriller; the server's list) and an optional note of up to 200 characters. One request returns five titles, each with genres, a reason and "Great / Good / Mild match", plus a short reading of the mood.
- **A limited daily allowance.** The server gives each account a fixed number of AI requests per UTC day, shared with the other AI features (the web app's Judge my taste and Similar manga), and gives one back when a request fails. The app cannot read how many are left (no endpoint), so it says so in words and, at the limit, shows the server's own message ("Daily AI limit of 5 reached. It resets at 00:00 UTC."). Nothing is retried automatically (`retry: false`) and the button is locked while a request is out, so one tap is one request.
- **Slow on purpose.** AI answers take far longer than anything else, so this one request waits up to 60 seconds (`timeoutMs` on `api.post`; everything else keeps 20) and the screen says "This can take up to a minute."
- **The last answer is kept** for the session (`mood-result` in the query cache, in memory only, not in the offline copy), so leaving and returning shows the picks and the mood again without spending another request. A failed request leaves the previous picks on screen. Signing out clears it.
- **From a pick to your library.** The AI names titles; it does not know which sites have them. **Find & track** sends the reader to the Search tab with the title already searched for (`/search?q=…`, with a timestamp `t` so the same title can be sent twice), where the normal flow (preview, Track from the site that has it) applies. A pick the server says is already in the library (`from_your_library`) shows **In your library · Open** and opens that title.

## Reading from the first chapter

The title page has **First chapter** beside **Latest chapter** (both read **Read first chapter** / **Read latest chapter** to a screen reader). First chapter opens the oldest chapter the source site lists, in the same browser tab as every other chapter, and never changes your reading progress (opening chapter 1 is not the same as having read it).

- **Where the link comes from.** MangaPulse keeps it with the title's source record (`preferred_source_record.first_chapter` and `first_chapter_url`), filled when the title is first tracked and by a one-off `backfill-first-chapters` command for titles tracked before. The app only reads it; it is never worked out on the phone (WeebCentral's chapter links are ids, and MangaRead's often carry a title, so a link cannot be guessed from the latest one).
- **Never a broken button.** With no link yet (a title not backfilled, or a server without the change) the button is simply not there and the title page looks as before. Only `http(s)` links are ever opened. With no latest-chapter link either, the first-chapter button takes the whole row.
- **Offline.** The link is part of the offline copy of the library, so the button shows offline; opening it needs a connection like any chapter.

