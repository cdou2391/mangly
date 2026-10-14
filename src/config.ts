const raw = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080/api/v1";

export const API_URL = raw.replace(/\/+$/, "");
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Initial-release shell: only the splash screen and the home empty state. No auth, no network.
 * Enabled at build time with EXPO_PUBLIC_SHELL_ONLY=1 (see .github/workflows/build-apk.yml).
 */
export const SHELL_ONLY = process.env.EXPO_PUBLIC_SHELL_ONLY === "1";
