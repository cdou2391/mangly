const raw = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080/api/v1";

export const API_URL = raw.replace(/\/+$/, "");
export const REQUEST_TIMEOUT_MS = 20_000;
