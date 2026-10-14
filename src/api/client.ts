import { API_URL, REQUEST_TIMEOUT_MS } from "@/config";
import { tokenStore } from "@/auth/tokenStore";
import type { TokenPair } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type SessionListener = (session: TokenPair | null) => void;

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSession: SessionListener = () => {};

/** AuthProvider subscribes here to learn about refreshed or lost sessions. */
export function setSessionListener(listener: SessionListener) {
  onSession = listener;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export async function applySession(pair: TokenPair) {
  accessToken = pair.access_token;
  await tokenStore.setRefreshToken(pair.refresh_token);
  onSession(pair);
}

export async function dropSession() {
  accessToken = null;
  await tokenStore.clear();
  onSession(null);
}

async function rawFetch(path: string, init: RequestInit, auth: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ApiError(0, aborted ? "Request timed out." : "Network error. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchange the stored refresh token for a new pair. Single-flight: concurrent 401s share one call,
 * because the server rotates refresh tokens and a second parallel use would look like token theft.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refresh = await tokenStore.getRefreshToken();
      if (!refresh) return false;
      const res = await rawFetch(
        "/auth/mobile/refresh",
        { method: "POST", body: JSON.stringify({ refresh_token: refresh }) },
        false,
      ).catch(() => null);
      if (!res) return false; // offline: keep the stored token, try again later
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) await dropSession();
        return false;
      }
      await applySession((await res.json()) as TokenPair);
      return true;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function toError(res: Response): Promise<ApiError> {
  let detail: unknown;
  try {
    detail = (await res.json())?.detail;
  } catch {
    // non-JSON error body
  }
  let message = `Request failed (${res.status}).`;
  if (typeof detail === "string") message = detail;
  else if (Array.isArray(detail) && detail[0]?.msg) message = String(detail[0].msg);
  return new ApiError(res.status, message, detail);
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {},
): Promise<T> {
  const auth = opts.auth ?? true;
  let res = await rawFetch(path, init, auth);
  if (res.status === 401 && auth && (await refreshSession())) {
    res = await rawFetch(path, init, auth);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, opts),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
