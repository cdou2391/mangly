// Shared fixtures for the navigation smoke tests (src/__tests__/smoke). Each scenario lives in its own
// file because Expo Router keeps global router state that does not survive a second render in one file.
import { setAccessToken, setSessionListener } from "@/api/client";

export { store } from "./mocks";

export const user = {
  id: 1, full_name: "Ada", email: "ada@example.com", role: "user", is_active: true,
  created_at: "", updated_at: "", features: [],
};

export const pair = {
  access_token: "access", refresh_token: "mpr_refresh", token_type: "bearer", expires_in: 900, user,
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function routeFetch(handlers: Record<string, () => Response>) {
  globalThis.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+\/api\/v1/, "");
    const handler = Object.entries(handlers).find(([p]) => path.startsWith(p));
    return handler ? handler[1]() : json(404, { detail: "unmocked " + path });
  }) as unknown as typeof fetch;
}

export function offlineFetch() {
  globalThis.fetch = jest.fn(async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
}

export function resetClientState() {
  setAccessToken(null);
  setSessionListener(() => {});
}

// A string only the sign-in screen renders (its primary button).
export const SIGN_IN_TEXT = "Log In";
