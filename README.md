# Mangly

Android app for [MangaPulse](https://github.com/cdou2391/MangaPulse): track manga across MangaRead and WeebCentral and get a push notification when a new chapter drops.

Mangly is a **client only**. It talks to a MangaPulse backend over HTTPS and owns no scraping, database or scheduling logic.

| | |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19, TypeScript (strict) |
| Navigation | Expo Router (file-based, `src/app`) |
| Data | TanStack Query over a small `fetch` client (`src/api`) |
| Auth | Bearer access token (memory) + rotating refresh token (Android Keystore via `expo-secure-store`) |
| Push | `expo-notifications` + Expo Push Service (FCM underneath) |
| Platform | Android only |

## Status

| Area | State |
|---|---|
| Sign in / register / sign out | Implemented in the app. **Needs the MangaPulse mobile auth endpoints** |
| Library, title detail, status and progress edits | Implemented (existing API) |
| Updates feed, search and track, alerts inbox | Implemented (existing API) |
| Push notifications | App side implemented. **Needs the MangaPulse device endpoints and sender** |
| AI recommendations, admin | Not started |

The backend changes are specified in [`docs/BACKEND_WORK.md`](docs/BACKEND_WORK.md). Until they ship, sign-in returns 404 from `/auth/mobile/login`.

## Initial APK (splash + home empty state)

The first installable build shows only the splash screen and an empty home screen. It does no sign-in and makes no network calls. It is selected at build time with `EXPO_PUBLIC_SHELL_ONLY=1`.

**Get it:** push to a `claude/**` branch, a `v*` tag, or run **Actions → Build APK → Run workflow**, then download `mangly-shell-apk` from the run page and sideload the `.apk`.

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

Push notifications need a **development or release build** and a physical device. Expo Go and emulators cannot receive them.

## Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (API client, token refresh) |
| `npm run check` | Both of the above; CI runs the same |

## Build and release

```bash
npx eas-cli@latest init                       # once: creates the EAS project, writes extra.eas.projectId
npx eas-cli@latest build -p android --profile preview      # installable APK
npx eas-cli@latest build -p android --profile production   # AAB for Google Play
```

For push, upload an FCM V1 service-account key to EAS (`eas credentials`) and add `google-services.json` per the Expo push setup guide.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design, auth flow, push flow, security decisions
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — every endpoint the app calls, existing and new
- [`docs/BACKEND_WORK.md`](docs/BACKEND_WORK.md) — changes required in MangaPulse, with acceptance criteria
