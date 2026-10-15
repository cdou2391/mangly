import { API_URL, REFRESH_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from "@/config";
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
let refreshInFlight: Promise<RestoreOutcome> | null = null;
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

const TIMED_OUT = "timeout";
const isTimeout = (e: unknown) => e instanceof ApiError && e.status === 0 && e.detail === TIMED_OUT;

async function rawFetch(path: string, init: RequestInit, auth: boolean, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ApiError(0, aborted ? "Request timed out." : "Network error. Check your connection.", aborted ? TIMED_OUT : undefined);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A 4xx other than "slow down" or "too slow" means the server read the request and will never accept this token
 * (a malformed one is a 422, for instance), so waiting would not help. 5xx, 408 and 429 are the server's trouble, not the token's.
 */
const isPermanentRefusal = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 429;

/** How restoring a session went: "none" = nothing stored, "rejected" = the server refused it (and it is now dropped), "unreachable" = could not tell. */
export type RestoreOutcome = "ok" | "none" | "rejected" | "unreachable";

/**
 * Exchange the stored refresh token for a new pair. Single-flight: concurrent callers share one call, because the
 * server rotates refresh tokens and a second parallel use would look like token theft.
 *
 * Only an explicit refusal (401/403) ends the session. Being offline, a timeout, a server error or a rate limit say
 * nothing about the token, so it is kept and the outcome is "unreachable".
 */
export function restoreSession(): Promise<RestoreOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RestoreOutcome> => {
      const refresh = await tokenStore.getRefreshToken();
      if (!refresh) return "none";
      for (let attempt = 0; attempt < 2; attempt++) {
        let res: Response;
        try {
          res = await rawFetch("/auth/mobile/refresh", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) }, false, REFRESH_TIMEOUT_MS);
        } catch (e) {
          // After a timeout the server may have rotated the token without the reply arriving. It accepts the old token again
          // for a few seconds, so try once more straight away; any other failure never reached it.
          if (isTimeout(e) && attempt === 0) continue;
          return "unreachable";
        }
        if (res.status === 401 || res.status === 403 || isPermanentRefusal(res.status)) {
          await dropSession();
          return "rejected";
        }
        if (!res.ok) return "unreachable";
        try {
          await applySession((await res.json()) as TokenPair);
        } catch {
          return "unreachable"; // an unreadable reply is a server problem, not a verdict on the token
        }
        return "ok";
      }
      return "unreachable";
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** True when the session was renewed. Used when a request comes back 401 mid-session. */
export async function refreshSession(): Promise<boolean> {
  return (await restoreSession()) === "ok";
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
