import { ApiError, api, applySession, request, setAccessToken, setSessionListener } from "../client";
import type { TokenPair } from "../types";

const store: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
}));

const user = { id: 1, full_name: "T", email: "t@e.com", role: "user", is_active: true, created_at: "", updated_at: "", features: [] };
const pair = (n: number): TokenPair => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: "bearer",
  expires_in: 900,
  user: user as TokenPair["user"],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: jest.Mock;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setAccessToken(null);
  setSessionListener(() => {});
});

describe("request", () => {
  it("sends the bearer token", async () => {
    setAccessToken("abc");
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api.get("/tracked-manga");
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer abc");
  });

  it("surfaces FastAPI string details as the error message", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { detail: "Already tracked." }));
    await expect(request("/x")).rejects.toMatchObject({ status: 409, message: "Already tracked." });
  });

  it("surfaces validation errors from the first item", async () => {
    fetchMock.mockResolvedValueOnce(json(422, { detail: [{ msg: "Rating must be between 1 and 5" }] }));
    await expect(request("/x")).rejects.toThrow("Rating must be between 1 and 5");
  });

  it("maps network failure to ApiError(0)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(request("/x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("refresh on 401", () => {
  it("refreshes once, retries, and stores the rotated refresh token", async () => {
    await applySession(pair(1));
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: "Not authenticated." })) // original
      .mockResolvedValueOnce(json(200, pair(2))) // refresh
      .mockResolvedValueOnce(json(200, [{ id: 1 }])); // retry

    const data = await api.get<{ id: number }[]>("/tracked-manga");

    expect(data).toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/mobile/refresh");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh_token: "refresh-1" });
    expect((fetchMock.mock.calls[2][1].headers as Headers).get("Authorization")).toBe("Bearer access-2");
    expect(store["mangly.refresh_token"]).toBe("refresh-2");
  });

  it("shares one refresh between concurrent 401s", async () => {
    await applySession(pair(1));
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes("/auth/mobile/refresh")) {
        refreshCalls += 1;
        return json(200, pair(2));
      }
      const auth = (init.headers as Headers).get("Authorization");
      return auth === "Bearer access-2" ? json(200, { ok: true }) : json(401, { detail: "expired" });
    });

    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(refreshCalls).toBe(1);
  });

  it("drops the session when the server rejects the refresh token", async () => {
    await applySession(pair(1));
    const listener = jest.fn();
    setSessionListener(listener);
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: "expired" }))
      .mockResolvedValueOnce(json(401, { detail: "revoked" }));

    await expect(api.get("/tracked-manga")).rejects.toMatchObject({ status: 401 });
    expect(store["mangly.refresh_token"]).toBeUndefined();
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("keeps the stored token when the refresh fails because the device is offline", async () => {
    await applySession(pair(1));
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: "expired" }))
      .mockRejectedValueOnce(new TypeError("Network request failed"));

    await expect(api.get("/tracked-manga")).rejects.toMatchObject({ status: 401 });
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("does not try to refresh unauthenticated calls", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: "Invalid credentials." }));
    await expect(api.post("/auth/mobile/login", {}, { auth: false })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
