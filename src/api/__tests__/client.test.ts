import { ApiError, UNREACHABLE_MESSAGE, api, applySession, ping, request, restoreSession, setAccessToken, setSessionListener } from "../client";
import { isOnline, setOnline } from "../reachability";
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
  setOnline(true);
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

    // not a "401": the token was never refused, the server could not be asked
    await expect(api.get("/tracked-manga")).rejects.toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("reports a server error during the refresh as a connection problem too, and keeps the token", async () => {
    await applySession(pair(1));
    fetchMock.mockResolvedValueOnce(json(401, { detail: "expired" })).mockResolvedValueOnce(json(503, {}));
    await expect(api.get("/tracked-manga")).rejects.toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("does not try to refresh unauthenticated calls", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: "Invalid credentials." }));
    await expect(api.post("/auth/mobile/login", {}, { auth: false })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


describe("restoreSession", () => {
  const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

  it("says there is nothing to restore when no token is stored", async () => {
    expect(await restoreSession()).toBe("none");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores the session and keeps the rotated token", async () => {
    store["mangly.refresh_token"] = "refresh-1";
    const listener = jest.fn();
    setSessionListener(listener);
    fetchMock.mockResolvedValueOnce(json(200, pair(2)));
    expect(await restoreSession()).toBe("ok");
    expect(store["mangly.refresh_token"]).toBe("refresh-2");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ access_token: "access-2" }));
  });

  it.each([401, 403])("ends the session only when the server refuses the token (%i)", async (status) => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockResolvedValueOnce(json(status, { detail: "Invalid" }));
    expect(await restoreSession()).toBe("rejected");
    expect(store["mangly.refresh_token"]).toBeUndefined();
  });

  it.each([400, 404, 422])("ends the session when the server says the request itself is wrong (%i), since waiting cannot fix a token it will never accept", async (status) => {
    store["mangly.refresh_token"] = "mpr_garbled";
    fetchMock.mockResolvedValueOnce(json(status, { detail: "bad" }));
    expect(await restoreSession()).toBe("rejected");
    expect(store["mangly.refresh_token"]).toBeUndefined();
  });

  it.each([500, 502, 503, 429, 408])("keeps the token when the server answers %i, which says nothing about it", async (status) => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockResolvedValueOnce(json(status, { detail: "trouble" }));
    expect(await restoreSession()).toBe("unreachable");
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("keeps the token and does not retry when the device is offline", async () => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    expect(await restoreSession()).toBe("unreachable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("keeps the token when the reply cannot be read", async () => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 200 }));
    expect(await restoreSession()).toBe("unreachable");
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("retries once straight away after a timeout, with the same token, since the reply may have been lost", async () => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockRejectedValueOnce(abortError()).mockResolvedValueOnce(json(200, pair(2)));
    expect(await restoreSession()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refresh_token: "refresh-1" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh_token: "refresh-1" });
  });

  it("gives up after two timeouts, keeping the token", async () => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockRejectedValue(abortError());
    expect(await restoreSession()).toBe("unreachable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store["mangly.refresh_token"]).toBe("refresh-1");
  });

  it("gives the server 8 seconds to answer, not the 20 of ordinary requests", async () => {
    jest.useFakeTimers();
    try {
      store["mangly.refresh_token"] = "refresh-1";
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(abortError()))),
      );
      const outcome = restoreSession();
      await jest.advanceTimersByTimeAsync(7_900);
      expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting
      await jest.advanceTimersByTimeAsync(200); // 8 s: the first attempt times out and the retry starts
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(8_100);
      expect(await outcome).toBe("unreachable");
    } finally {
      jest.useRealTimers();
    }
  });

  it("shares one attempt between callers", async () => {
    store["mangly.refresh_token"] = "refresh-1";
    fetchMock.mockResolvedValue(json(200, pair(2)));
    const [a, b] = await Promise.all([restoreSession(), restoreSession()]);
    expect([a, b]).toEqual(["ok", "ok"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("reachability", () => {
  it("is offline after a request fails to connect, with a message that says to try again later", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(api.post("/tracked-manga/from-source", {})).rejects.toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
    expect(UNREACHABLE_MESSAGE).toMatch(/try again later/i);
    expect(isOnline()).toBe(false);
  });

  it("is offline after a timeout", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(api.get("/tracked-manga")).rejects.toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
    expect(isOnline()).toBe(false);
  });

  it("is online again as soon as the server answers, whatever it says", async () => {
    setOnline(false);
    fetchMock.mockResolvedValueOnce(json(409, { detail: "Already tracked" }));
    await expect(api.post("/tracked-manga/from-source", {})).rejects.toMatchObject({ status: 409 });
    expect(isOnline()).toBe(true);
  });

  it("is offline when the proxy in front of the server answers for it", async () => {
    fetchMock.mockResolvedValueOnce(json(502, {}));
    await expect(api.get("/tracked-manga")).rejects.toMatchObject({ status: 502 });
    expect(isOnline()).toBe(false);
  });

  it("pings the health endpoint without a token", async () => {
    setAccessToken("abc");
    fetchMock.mockResolvedValueOnce(json(200, { status: "ok" }));
    expect(await ping()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/health$/);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toBeNull();
  });

  it("pings false, and goes offline, when nothing answers", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await ping()).toBe(false);
    expect(isOnline()).toBe(false);
  });
});

describe("how long a request may take", () => {
  const slow = (answersAfterMs: number) =>
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          setTimeout(() => resolve(json(200, { ok: true })), answersAfterMs);
        }),
    );
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("gives up on an ordinary request after 20 seconds", async () => {
    slow(30_000);
    const settled = api.post("/x", {}).catch((e) => e);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await settled).toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
  });

  it("waits as long as the caller asked for, which an AI answer needs", async () => {
    slow(30_000);
    const done = api.post("/x", {}, { timeoutMs: 60_000 });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(done).resolves.toEqual({ ok: true });
  });

  it("still gives up at that longer time", async () => {
    slow(90_000);
    const settled = api.post("/x", {}, { timeoutMs: 60_000 }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(await settled).toMatchObject({ status: 0 });
  });

  it("keeps the longer time when the request is sent again after the session was renewed", async () => {
    setAccessToken("old");
    await applySession(pair(1));
    let calls = 0;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith("/auth/mobile/refresh")) return Promise.resolve(json(200, pair(2)));
      calls += 1;
      if (calls === 1) return Promise.resolve(json(401, { detail: "expired" }));
      return new Promise((resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        setTimeout(() => resolve(json(200, { ok: true })), 40_000);
      });
    });
    const done = api.post("/x", {}, { timeoutMs: 60_000 });
    await jest.advanceTimersByTimeAsync(40_000);
    await expect(done).resolves.toEqual({ ok: true });
  });
});

