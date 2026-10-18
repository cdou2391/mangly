import { MOOD_TIMEOUT_MS, mangaApi, recommendationsApi, trackingApi } from "../endpoints";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());

let fetchMock: jest.Mock;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const call = () => ({ url: fetchMock.mock.calls[0][0] as string, init: fetchMock.mock.calls[0][1] as RequestInit });

beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("home picks", () => {
  it("asks for eight by default, or as many as given", async () => {
    fetchMock.mockResolvedValue(json([]));
    await mangaApi.homePicks();
    expect(call().url).toMatch(/\/manga\/home-picks\?limit=8$/);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json([]));
    await mangaApi.homePicks(4);
    expect(call().url).toMatch(/\/manga\/home-picks\?limit=4$/);
  });

  it("a pick is followed by sending the manga id to the tracking list", async () => {
    fetchMock.mockResolvedValue(json({ id: 1 }, 201));
    await trackingApi.track(7);
    expect(call().url).toMatch(/\/tracked-manga$/);
    expect(call().init.method).toBe("POST");
    expect(JSON.parse(call().init.body as string)).toEqual({ manga_id: 7 });
  });
});

describe("previewing a title", () => {
  it("asks for the details of a page on a site, with the address and the site encoded", async () => {
    fetchMock.mockResolvedValue(json({ title: "Berserk" }));
    await mangaApi.details("https://mangaread.org/manga/berserk/?a=1&b=2", "mangaread");
    expect(call().url).toMatch(/\/manga\/details\?url=https%3A%2F%2Fmangaread\.org%2Fmanga%2Fberserk%2F%3Fa%3D1%26b%3D2&source=mangaread$/);
    expect(call().init.method ?? "GET").toBe("GET");
  });
});

describe("mood picks", () => {
  it("posts the mood and the note to the mood endpoint", async () => {
    fetchMock.mockResolvedValue(json({ mood: "happy", mood_analysis: "x", recommendations: [], generated_by: "anthropic" }));
    const result = await recommendationsApi.byMood({ mood: "happy", context: "something short" });
    expect(call().url).toMatch(/\/recommendations\/by-mood$/);
    expect(call().init.method).toBe("POST");
    expect(JSON.parse(call().init.body as string)).toEqual({ mood: "happy", context: "something short" });
    expect(result.mood).toBe("happy");
  });

  it("leaves the note out when there is none", async () => {
    fetchMock.mockResolvedValue(json({}));
    await recommendationsApi.byMood({ mood: "epic" });
    expect(JSON.parse(call().init.body as string)).toEqual({ mood: "epic" });
  });

  it("allows a minute for the AI to answer", () => {
    expect(MOOD_TIMEOUT_MS).toBe(60_000);
  });

  it("really waits longer than an ordinary request would", async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
            setTimeout(() => resolve(json({ mood: "happy", mood_analysis: "x", recommendations: [], generated_by: "anthropic" })), 30_000);
          }),
      );
      const done = recommendationsApi.byMood({ mood: "happy" });
      await jest.advanceTimersByTimeAsync(30_000);
      await expect(done).resolves.toMatchObject({ mood: "happy" });
    } finally {
      jest.useRealTimers();
    }
  });
});

