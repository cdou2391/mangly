# MangaPulse for Android

Android app for [MangaPulse](https://github.com/cdou2391/MangaPulse): track manga across MangaRead and WeebCentral and get a notification when a new chapter drops.

The app is shown to users as **MangaPulse** (the code lives in the `mangly` repository). It is a **client only**. It talks to a MangaPulse backend over HTTPS and owns no scraping, database or scheduling logic.

| | |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19, TypeScript (strict) |
| Navigation | Expo Router (file-based, `src/app`) |
| Data | TanStack Query over a small `fetch` client (`src/api`) |
| Auth | Bearer access token (memory) + rotating refresh token (Android Keystore via `expo-secure-store`) |
| Notifications | Background check on the phone (`expo-background-task`) + local notifications (`expo-notifications`); no push server |
| Platform | Android only |

> **Naming.** The launcher name is set by `name` in `app.json`. The Android package id (`com.cdou2391.mangly`), the Expo `slug` and the storage keys keep the original `mangly` name on purpose: changing the package id makes Android treat the app as a different one, so it could not be installed over an existing copy and would lose the saved login.

## Status

| Area | State |
|---|---|
| Sign in / register / sign out | Implemented. Backend merged in MangaPulse PR #20; **must be deployed** for sign-in to work |
| Library (search, filters, sorting, pages of ten), title detail, status, rating and progress edits (set the chapter by hand, continue reading) | Implemented (existing API; search and paging run on the phone) |
| Updates feed (alerts and new chapters in one list), search with a preview before tracking | Implemented (existing API) |
| Export the library as CSV or JSON, reading stats, clear read alerts | Implemented (built on the phone; clearing uses `DELETE /notifications/read`) |
| Change password in the app | Implemented (existing `POST /auth/change-password`; this device is signed in again, other devices are signed out) |
| Home hero: Similar / Popular recommendations | Implemented. Needs MangaPulse `GET /manga/home-picks` (to be deployed) |
| New-chapter notifications | Implemented (background check, no backend change). Tapping one opens the chapter; Settings shows the last check, the typical delay and a test button. Delivery is delayed by Android, see ARCHITECTURE.md |
| Pick by mood (AI) | Implemented for accounts with the `mood_recommendations` feature (existing endpoint; shares the daily AI limit) |
| Judge my taste, admin | Not started |

The backend changes are specified in [`docs/BACKEND_WORK.md`](docs/BACKEND_WORK.md). Until the MangaPulse release containing PR #20 is deployed, sign-in returns 404 from `/auth/mobile/login`.

## Installable APK

Every push to a `claude/**` branch or a `v*` tag builds an APK in GitHub Actions (**Actions → Build APK**, artifact `mangly-apk`). Download it, unzip, and sideload the `.apk`. The build points at `https://mangapulse.corecrest.tech/api/v1` and fails if that URL is not in the compiled bundle.

- **Full app (default):** sign-in, library, updates (alerts and new chapters in one feed), search, settings. Needs the MangaPulse mobile auth endpoints deployed (`feat/mobile-auth`, merged as MangaPulse PR #20).
- **Shell:** only the splash and the empty home screen, no network. Set `EXPO_PUBLIC_SHELL_ONLY: "1"` in `.github/workflows/build-apk.yml`.

**Splash screen:** Android 12+ only lets the native splash show a small icon on a flat colour, so the artwork (`assets/splash-art.jpg`) is drawn by the app itself. The native splash is a plain dark screen that hands over to the full-screen artwork (`src/components/SplashOverlay.tsx`) as soon as it has loaded; the artwork stays for at least 1.4 s, then fades out once the session is restored. To change it, replace `assets/splash-art.jpg` (portrait, about 1080x1920 or larger; it is scaled to cover the screen, so the edges may be trimmed on tall phones).

**Signing:** the APK is signed with the Expo debug keystore. That is fine for testing. Do not distribute it, and expect to uninstall it before installing a properly signed build later.

## Run it

Requirements: Node 22+, Android Studio (emulator and SDK) or a USB-connected phone, a running MangaPulse backend.

```bash
cp .env.example .env          # set EXPO_PUBLIC_API_URL
npm install
npm run android               # builds and installs a development build
npm run dev                   # later: start Metro for the installed dev build
# add EXPO_PUBLIC_SHELL_ONLY=1 to .env to run the shell-only variant locally
```

`EXPO_PUBLIC_API_URL` must include `/api/v1`. From the Android emulator, the host machine is `10.0.2.2`. Release builds must use `https://`.

Notifications need a **development or release build** (the background task is native code); Expo Go does not include it. Delivery depends on Android's background scheduling, so test on a physical device and allow 15+ minutes.

## Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest: API client and token refresh, plus navigation smoke tests that render the real route tree |
| `npm run check` | Both of the above; CI runs the same |

## Build and release

```bash
npx eas-cli@latest init                       # once: creates the EAS project (only needed for EAS builds)
npx eas-cli@latest build -p android --profile preview      # installable APK
npx eas-cli@latest build -p android --profile production   # AAB for Google Play
```

Notifications need no credentials. (Server push would: see "If instant delivery is wanted later" in the architecture doc.)

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design, auth flow, notifications, security decisions
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — every endpoint the app calls, existing and new
- [`docs/BACKEND_WORK.md`](docs/BACKEND_WORK.md) — changes required in MangaPulse, with acceptance criteria
