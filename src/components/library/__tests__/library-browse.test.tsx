import { FlatList } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Library from "@/app/(tabs)/library";
import { mangaApi, notificationsApi, trackingApi } from "@/api/endpoints";
import type { TrackedManga } from "@/api/types";
import { store } from "@/test-utils/mocks";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("@/api/endpoints", () => ({
  trackingApi: { list: jest.fn(), recentChapters: jest.fn(), update: jest.fn(), track: jest.fn() },
  notificationsApi: { list: jest.fn() },
  mangaApi: { homePicks: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const NOW = "2026-10-14T12:00:00Z";

type Over = { read?: string | null; latest?: string | null; status?: TrackedManga["reading_status"]; author?: string | null; rating?: number | null; created?: string; updated?: string };
function title(name: string, o: Over = {}): TrackedManga {
  const { read = "5", latest = "5", status = "reading", author = null, rating = null, created = NOW, updated = NOW } = o;
  const id = Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  return {
    id, user_id: 1, manga_id: id, preferred_source_record_id: null, last_chapter_read: read, last_chapter_url: null, reading_status: status, user_status_override: null,
    notifications_enabled: true, rating, created_at: created, updated_at: NOW, preferred_source_record: null,
    manga: { id, canonical_name: name, genres: null, author, summary: null, cover_url: null, latest_chapter: latest, latest_chapter_url: null, global_status: "ongoing", created_at: NOW, updated_at: updated },
  } as TrackedManga;
}
/** n titles named "Title 01"... with distinct, increasing recency so the default order is predictable. */
const many = (n: number) => Array.from({ length: n }, (_, i) => title(`Title ${String(i + 1).padStart(2, "0")}`, { updated: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderLibrary = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Library />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

/** The titles on screen, in order, read from the rows' labels. */
const shown = () =>
  screen
    .queryAllByRole("button")
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => /\. (Read|Not started)/.test(l ?? ""))
    .map((l) => l.split(". ")[0]);
const typeSearch = (text: string) => fireEvent.changeText(screen.getByLabelText("Search your library"), text);

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(store).forEach((k) => delete store[k]);
  (trackingApi.recentChapters as jest.Mock).mockResolvedValue([]);
  (notificationsApi.list as jest.Mock).mockResolvedValue([]);
  (mangaApi.homePicks as jest.Mock).mockResolvedValue([]);
  list.mockResolvedValue([title("Berserk", { author: "Kentaro Miura" }), title("One Piece", { author: "Eiichiro Oda" }), title("Pokémon Adventures")]);
});

describe("searching the library", () => {
  it("narrows the list as you type, ignoring case and accents, and brings everything back when cleared", async () => {
    await renderLibrary();
    await screen.findByText("Berserk");
    expect(shown()).toHaveLength(3);
    await typeSearch("POKEMON");
    expect(shown()).toEqual(["Pokémon Adventures"]);
    await typeSearch("piece");
    expect(shown()).toEqual(["One Piece"]);
    await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    expect(shown()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("also finds a title by its author", async () => {
    await renderLibrary();
    await screen.findByText("Berserk");
    await typeSearch("miura");
    expect(shown()).toEqual(["Berserk"]);
  });

  it("says when nothing matches, and one tap clears the search", async () => {
    await renderLibrary();
    await screen.findByText("Berserk");
    await typeSearch("zzz");
    expect(await screen.findByText("No matches")).toBeTruthy();
    expect(screen.getByText('Nothing in your library matches "zzz".')).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(shown()).toHaveLength(3);
    expect((screen.getByLabelText("Search your library").props.value as string)).toBe("");
  });

  it("only searches what is in the library: it never asks the server", async () => {
    await renderLibrary();
    await screen.findByText("Berserk");
    list.mockClear();
    await typeSearch("berserk");
    expect(list).not.toHaveBeenCalled();
  });

  it("is not offered when the library is empty", async () => {
    list.mockResolvedValue([]);
    await renderLibrary();
    await screen.findByText("Nothing here yet");
    expect(screen.queryByLabelText("Search your library")).toBeNull();
  });
});

describe("filtering", () => {
  beforeEach(() =>
    list.mockResolvedValue([
      title("Behind A", { read: "1", latest: "9" }),
      title("Caught up B", { read: "9", latest: "9" }),
      title("Done C", { status: "completed", read: "9", latest: "9" }),
      title("Behind D", { status: "completed", read: "2", latest: "9" }),
    ]),
  );

  it("has an Unread filter with how many titles you are behind on, that narrows to them and toggles off", async () => {
    await renderLibrary();
    await screen.findByRole("button", { name: /^Behind A\. Read/ });
    expect(screen.getByRole("button", { name: "Unread only, 2" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Unread only, 2" }));
    expect(shown().sort()).toEqual(["Behind A", "Behind D"]);
    expect(screen.getByRole("button", { name: "Unread only, 2" }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Unread only, 2" }));
    expect(shown()).toHaveLength(4);
  });

  it("combines Unread with a status and with the search", async () => {
    await renderLibrary();
    await screen.findByRole("button", { name: /^Behind A\. Read/ });
    await fireEvent.press(screen.getByRole("button", { name: "Unread only, 2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Done, 2" }));
    expect(shown()).toEqual(["Behind D"]);
    await typeSearch("zzz");
    expect(await screen.findByText('Nothing in your library matches "zzz" with these filters.')).toBeTruthy();
  });

  it("keeps the Unread filter on screen while it is on, even when nothing is unread any more, so it can be turned off", async () => {
    await renderLibrary();
    await screen.findByRole("button", { name: /^Behind A\. Read/ });
    await fireEvent.press(screen.getByRole("button", { name: "Unread only, 2" }));
    list.mockResolvedValue([title("Behind A", { read: "9", latest: "9" }), title("Behind D", { read: "9", latest: "9" })]); // caught up
    await act(async () => screen.getByTestId("library-list").props.refreshControl.props.onRefresh());
    expect(await screen.findByText("No titles here")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Unread only, 0" }));
    expect(shown().sort()).toEqual(["Behind A", "Behind D"]);
    expect(screen.queryByRole("button", { name: /^Unread only/ })).toBeNull(); // off and nothing unread: not offered
  });

  it("explains an empty combination, and clears it", async () => {
    list.mockResolvedValue([title("Only", { status: "completed", read: "9", latest: "9" })]);
    await renderLibrary();
    await screen.findByText("Only");
    // no unread titles at all: the filter is not offered
    expect(screen.queryByRole("button", { name: /^Unread only/ })).toBeNull();
  });
});

describe("sorting", () => {
  beforeEach(() => list.mockResolvedValue([title("banana", { rating: 3 }), title("Apple", { rating: 5 }), title("Cherry", { rating: null })]));

  it("starts with the unread-first order, and says so on the button", async () => {
    await renderLibrary();
    await screen.findByText("Apple");
    expect(screen.getByRole("button", { name: "Sort: Most unread first" })).toBeTruthy();
  });

  it("opens a list of orders, and choosing one reorders the list, closes the list and is shown on the button", async () => {
    await renderLibrary();
    await screen.findByText("Apple");
    await fireEvent.press(screen.getByRole("button", { name: /^Sort:/ }));
    for (const label of ["Most unread first", "Recently updated", "Recently added", "Title A to Z", "Title Z to A", "Highest rated"]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("radio", { name: "Most unread first" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole("radio", { name: "Title Z to A" }));
    expect(shown()).toEqual(["Cherry", "banana", "Apple"]);
    expect(screen.queryByRole("radio", { name: "Title A to Z" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sort: Title Z to A" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Sort:/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "Highest rated" }));
    expect(shown()).toEqual(["Apple", "banana", "Cherry"]);
  });

  it("closes without changing anything when the backdrop is tapped", async () => {
    await renderLibrary();
    await screen.findByText("Apple");
    await fireEvent.press(screen.getByRole("button", { name: /^Sort:/ }));
    await fireEvent.press(screen.getByLabelText("Close sort options"));
    expect(screen.queryByRole("radio", { name: "Title A to Z" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sort: Most unread first" })).toBeTruthy();
  });

  it("remembers the order for next time", async () => {
    const view = await renderLibrary();
    await screen.findByText("Apple");
    await fireEvent.press(screen.getByRole("button", { name: /^Sort:/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "Title A to Z" }));
    expect(store["mangly.library_sort"]).toBe("az");
    await view.unmount();
    await renderLibrary();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sort: Title A to Z" })).toBeTruthy());
    expect(shown()).toEqual(["Apple", "banana", "Cherry"]);
  });

  it("falls back to the default when what was saved is not an order it knows", async () => {
    store["mangly.library_sort"] = "sideways";
    await renderLibrary();
    await screen.findByText("Apple");
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Sort: Most unread first" })).toBeTruthy();
  });
});

describe("pages of ten", () => {
  beforeEach(() => list.mockResolvedValue(many(23)));
  const sortAZ = async () => {
    await fireEvent.press(screen.getByRole("button", { name: /^Sort:/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "Title A to Z" }));
  };

  it("shows ten titles and where you are", async () => {
    await renderLibrary();
    await screen.findByText("Page 1 of 3");
    await sortAZ();
    expect(shown()).toHaveLength(10);
    expect(shown()[0]).toBe("Title 01");
    expect(shown()[9]).toBe("Title 10");
    expect(screen.getByText("1–10 of 23")).toBeTruthy();
    expect(screen.getByLabelText("Page 1 of 3. Titles 1 to 10 of 23.")).toBeTruthy();
  });

  it("goes forward and back, with the ends disabled", async () => {
    await renderLibrary();
    await screen.findByText("Page 1 of 3");
    await sortAZ();
    expect(screen.getByRole("button", { name: "Previous page" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(shown()[0]).toBe("Title 11");
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("21–23 of 23")).toBeTruthy();
    expect(shown()).toEqual(["Title 21", "Title 22", "Title 23"]);
    expect(screen.getByRole("button", { name: "Next page" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });

  it("scrolls back up to the list when the page changes", async () => {
    const scroll = jest.spyOn(FlatList.prototype, "scrollToOffset");
    await renderLibrary();
    await screen.findByText("Page 1 of 3");
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ animated: true }));
    scroll.mockRestore();
  });

  it("starts again from the first page when the search, a filter or the order changes", async () => {
    await renderLibrary();
    await screen.findByText("Page 1 of 3");
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    await typeSearch("title");
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    await fireEvent.press(screen.getByRole("button", { name: "Reading, 23" }));
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    await sortAZ();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
  });

  it("pages the search results too, and shows no pager when they fit on one page", async () => {
    await renderLibrary();
    await screen.findByText("Page 1 of 3");
    await typeSearch("title 1"); // 01, 10 to 19 and 21: twelve titles
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByText("1–10 of 12")).toBeTruthy();
    await typeSearch("title 2"); // 02, 12, 20 to 23: six titles
    expect(shown()).toHaveLength(6);
    expect(screen.queryByText(/^Page /)).toBeNull();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  });

  it("is not shown when everything fits on one page", async () => {
    list.mockResolvedValue(many(10));
    await renderLibrary();
    await screen.findByText("Title 10");
    expect(shown()).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByText(/^Page /)).toBeNull();
  });

  it("one more than a page makes a second page of one", async () => {
    list.mockResolvedValue(many(11));
    await renderLibrary();
    await screen.findByText("Page 1 of 2");
    await fireEvent.press(screen.getByRole("button", { name: "Next page" }));
    expect(shown()).toHaveLength(1);
    expect(screen.getByText("11–11 of 11")).toBeTruthy();
  });
});
