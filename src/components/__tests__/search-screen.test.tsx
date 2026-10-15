import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import Search from "@/app/(tabs)/search";
import { ApiError } from "@/api/client";
import { mangaApi, trackingApi } from "@/api/endpoints";
import type { SearchCandidate, TrackedManga } from "@/api/types";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("@/api/endpoints", () => ({
  mangaApi: { search: jest.fn() },
  trackingApi: { list: jest.fn(), fromSource: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));

const search = mangaApi.search as jest.Mock;
const listTracked = trackingApi.list as jest.Mock;
const fromSource = trackingApi.fromSource as jest.Mock;

const cand = (title: string, source: string, over: Partial<SearchCandidate> = {}): SearchCandidate => ({
  title, url: `https://${source}.test/${title.toLowerCase().replace(/\W+/g, "-")}/`, cover_url: null, author: null, status: null, alternative_titles: [], source, ...over,
});
const tracked = (id: number, name: string): TrackedManga => ({ id, manga: { canonical_name: name }, preferred_source_record: null }) as TrackedManga;

const DRAGON = [
  cand("Dragon Ball", "mangaread", { author: "Akira Toriyama", status: "completed" }),
  cand("Dragon Ball", "weebcentral"),
  cand("Dragon Quest: Dai", "mangaread", { author: "Riku Sanjo" }),
  cand("Dragon Heart", "weebcentral"),
];

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderSearch = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Search />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

const box = () => screen.getByLabelText("Search for a title");
async function find(text: string) {
  await fireEvent.changeText(box(), text);
  await fireEvent(box(), "submitEditing");
}

beforeEach(() => {
  jest.clearAllMocks();
  search.mockResolvedValue(DRAGON);
  listTracked.mockResolvedValue([]);
  fromSource.mockImplementation(async () => tracked(70, "Dragon Ball"));
});

describe("the search box", () => {
  it("starts with an invitation, and does not search for fewer than 2 characters", async () => {
    await renderSearch();
    expect(screen.getByText("Find your next read")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" }).props.accessibilityState.disabled).toBe(true);
    await find("a");
    await find("   ");
    expect(search).not.toHaveBeenCalled();
  });

  it("searches once with the words trimmed and tidied, from the keyboard or the button", async () => {
    await renderSearch();
    await find("  dragon    ball ");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith("dragon ball");
    await fireEvent.changeText(box(), "dragon quest");
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(search).toHaveBeenCalledWith("dragon quest"));
  });

  it("clears the field with the clear button", async () => {
    await renderSearch();
    await fireEvent.changeText(box(), "dragon");
    await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    expect(box().props.value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("looks again when the same words are searched a second time", async () => {
    await renderSearch();
    await find("dragon");
    await screen.findByText("3 titles for “dragon”");
    await find("dragon");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });
});

describe("the results", () => {
  it("shows one card per title, with every site that has it, however many sites returned it", async () => {
    await renderSearch();
    await find("dragon");
    expect(await screen.findByText("3 titles for “dragon”")).toBeTruthy(); // 4 results from the server
    const ball = screen.getByLabelText(/^Dragon Ball\. Akira Toriyama\. Completed\. On MangaRead and WeebCentral$/);
    expect(ball).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Track / })).toHaveLength(3);
  });

  it("explains an empty result", async () => {
    search.mockResolvedValue([]);
    await renderSearch();
    await find("zzz");
    expect(await screen.findByText("No results for “zzz”")).toBeTruthy();
  });

  it("shows a loading state while it searches, which can take several seconds", async () => {
    let finish!: (r: SearchCandidate[]) => void;
    search.mockReturnValue(new Promise<SearchCandidate[]>((resolve) => (finish = resolve)));
    await renderSearch();
    await find("dragon");
    expect(await screen.findByText("Searching MangaRead and WeebCentral…")).toBeTruthy();
    expect(screen.queryByText("Find your next read")).toBeNull();
    await act(async () => finish(DRAGON));
    expect(await screen.findByText("3 titles for “dragon”")).toBeTruthy();
    expect(screen.queryByText("Searching MangaRead and WeebCentral…")).toBeNull();
  });

  it("explains a failed search and tries again on request", async () => {
    search.mockRejectedValueOnce(new ApiError(429, "Rate limit exceeded: 20 per 1 minute"));
    await renderSearch();
    await find("dragon");
    expect(await screen.findByText("Search failed")).toBeTruthy();
    expect(screen.getByText(/too fast/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("3 titles for “dragon”")).toBeTruthy();
  });

  it("offers a filter by site only when some title is missing from a site, and narrows the list", async () => {
    await renderSearch();
    await find("dragon");
    await screen.findByText("3 titles for “dragon”");
    await fireEvent.press(screen.getByRole("button", { name: "WeebCentral" }));
    expect(screen.getByText("2 titles for “dragon”")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Dragon Quest: Dai/ })).toBeNull();
    expect(screen.getByRole("button", { name: "WeebCentral" }).props.accessibilityState.selected).toBe(true);

    search.mockResolvedValue([cand("Dungeon Meshi", "mangaread"), cand("Dungeon Meshi", "weebcentral")]);
    await find("dungeon");
    await screen.findByText("1 title for “dungeon”");
    expect(screen.queryByRole("button", { name: "WeebCentral" })).toBeNull(); // every title is on every site: nothing to choose
  });
});

describe("tracking a title", () => {
  const trackButton = (title: string) => screen.findByRole("button", { name: `Track ${title}` });
  const open = async () => {
    await renderSearch();
    await find("dragon");
    await screen.findByText("3 titles for “dragon”");
  };

  it("adds it from the first site, then shows it as in your library", async () => {
    await open();
    await fireEvent.press(await trackButton("Dragon Ball"));
    expect(fromSource).toHaveBeenCalledTimes(1);
    expect(fromSource).toHaveBeenCalledWith({ url: "https://mangaread.test/dragon-ball/", source: "mangaread" });
    expect(await screen.findByLabelText("In library")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Track Dragon Ball" })).toBeNull();
    expect(screen.getByRole("button", { name: "Track Dragon Heart" })).toBeTruthy(); // others untouched
  });

  it("uses the site chosen in the filter", async () => {
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "WeebCentral" }));
    await fireEvent.press(await trackButton("Dragon Ball"));
    expect(fromSource).toHaveBeenCalledWith({ url: "https://weebcentral.test/dragon-ball/", source: "weebcentral" });
  });

  it("ignores a second tap while it is adding, so a title is never added twice", async () => {
    let finish!: () => void;
    fromSource.mockReturnValue(new Promise((resolve) => (finish = () => resolve(tracked(70, "Dragon Ball")))));
    await open();
    const button = await trackButton("Dragon Ball");
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(fromSource).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Adding")).toBeTruthy();
    await act(async () => finish());
    expect(await screen.findByLabelText("In library")).toBeTruthy();
  });

  it("tries the next site when a site is down, and succeeds if another works", async () => {
    fromSource.mockRejectedValueOnce(new ApiError(502, "Could not fetch manga details. Please try again later."));
    await open();
    await fireEvent.press(await trackButton("Dragon Ball"));
    expect(await screen.findByLabelText("In library")).toBeTruthy();
    expect(fromSource.mock.calls.map((c) => c[0].source)).toEqual(["mangaread", "weebcentral"]);
  });

  it("says so and offers a retry when every site is down, and a retry works", async () => {
    fromSource.mockRejectedValue(new ApiError(502, "Could not fetch manga details. Please try again later."));
    await open();
    await fireEvent.press(await trackButton("Dragon Ball"));
    expect(await screen.findByText(/source site may be down/)).toBeTruthy();
    expect(fromSource).toHaveBeenCalledTimes(2); // both sites were tried
    fromSource.mockReset();
    fromSource.mockResolvedValue(tracked(70, "Dragon Ball"));
    await fireEvent.press(screen.getByRole("button", { name: "Retry adding Dragon Ball" }));
    expect(await screen.findByLabelText("In library")).toBeTruthy();
    expect(screen.queryByText(/source site may be down/)).toBeNull();
  });

  it("does not try other sites for an error that is not a site being down", async () => {
    fromSource.mockRejectedValue(new ApiError(429, "Rate limit exceeded"));
    await open();
    await fireEvent.press(await trackButton("Dragon Ball"));
    expect(await screen.findByText(/too fast/)).toBeTruthy();
    expect(fromSource).toHaveBeenCalledTimes(1);
  });

  it("treats the server saying it is already tracked as success", async () => {
    fromSource.mockRejectedValue(new ApiError(409, "Manga is already tracked."));
    await open();
    await fireEvent.press(await trackButton("Dragon Ball"));
    expect(await screen.findByLabelText("In library")).toBeTruthy();
    expect(screen.queryByText(/already tracked/)).toBeNull();
  });

  it("tells the user when they are offline", async () => {
    fromSource.mockRejectedValue(new ApiError(0, "Network error. Check your connection."));
    await open();
    await fireEvent.press(await trackButton("Dragon Heart"));
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
  });

  it("refreshes the library and the new chapters after adding", async () => {
    await open();
    const calls = listTracked.mock.calls.length;
    await fireEvent.press(await trackButton("Dragon Ball"));
    await waitFor(() => expect(listTracked.mock.calls.length).toBeGreaterThan(calls));
  });
});

describe("titles already in the library", () => {
  it("are marked, offer no Track button, and open the title when tapped", async () => {
    listTracked.mockResolvedValue([tracked(33, "dragon ball")]);
    await renderSearch();
    await find("dragon");
    await screen.findByText("3 titles for “dragon”");
    expect(await screen.findByLabelText("In library")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Track Dragon Ball" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^Dragon Ball\..*In your library/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "33" } });
  });

  it("a title just added opens with the id the server gave it", async () => {
    fromSource.mockResolvedValue(tracked(81, "Dragon Heart"));
    listTracked.mockResolvedValue([]); // the library list has not caught up yet
    await renderSearch();
    await find("dragon");
    await fireEvent.press(await screen.findByRole("button", { name: "Track Dragon Heart" }));
    await fireEvent.press(await screen.findByRole("button", { name: /^Dragon Heart\..*In your library/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "81" } });
  });

  it("do not open anything while it is only known to be added by the server's 'already tracked' answer", async () => {
    fromSource.mockRejectedValue(new ApiError(409, "Manga is already tracked."));
    await renderSearch();
    await find("dragon");
    await fireEvent.press(await screen.findByRole("button", { name: "Track Dragon Heart" }));
    await fireEvent.press(await screen.findByRole("button", { name: /^Dragon Heart\..*In your library/ }));
    expect(router.push).not.toHaveBeenCalled(); // its id is not known yet; the refreshed library will supply it
  });
});
