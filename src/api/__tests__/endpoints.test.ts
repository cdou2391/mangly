import { mangaApi, trackingApi } from "../endpoints";

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
