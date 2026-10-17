import { Platform, ToastAndroid } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { BROWSER_OPTIONS } from "@/utils/browser";
import Library from "@/app/(tabs)/library";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import type { AppNotification, RecentChapter, TrackedManga } from "@/api/types";

jest.mock("@/api/endpoints", () => ({
  trackingApi: { list: jest.fn(), recentChapters: jest.fn(), update: jest.fn(), track: jest.fn() },
  mangaApi: { homePicks: jest.fn(async () => []) },
  notificationsApi: { list: jest.fn(), markRead: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const recentChapters = trackingApi.recentChapters as jest.Mock;
const update = trackingApi.update as jest.Mock;
const listAlerts = notificationsApi.list as jest.Mock;
const markAlertRead = notificationsApi.markRead as jest.Mock;

const NOW = "2026-10-14T12:00:00Z";
function tracked(id: number, name: string, read: string | null, latest: string | null, status: TrackedManga["reading_status"] = "reading", at = NOW): TrackedManga {
  return {
    id, user_id: 1, manga_id: id, preferred_source_record_id: null, last_chapter_read: read, last_chapter_url: null,
    reading_status: status, user_status_override: null, notifications_enabled: true, rating: null, created_at: NOW, updated_at: NOW,
    manga: { id, canonical_name: name, genres: null, author: null, summary: null, cover_url: null, latest_chapter: latest, latest_chapter_url: null, global_status: "ongoing", created_at: NOW, updated_at: at },
    preferred_source_record: null,
  };
}
const recent = (id: number, title: string, chapter: string, url: string | null, isNew = true): RecentChapter => ({
  tracking_id: id, manga_id: id, manga_title: title, manga_cover_url: null, chapter, chapter_url: url, chapter_at: NOW, source: "mangaread", is_new: isNew,
});

const alert = (id: number, mangaId: number, chapter: string): AppNotification => ({
  id, user_id: 1, manga_id: mangaId, source_record_id: null, chapter_released: chapter, latest_chapter_url: null,
  source: "mangaread", is_read: false, created_at: NOW, manga: tracked(mangaId, "x", null, null).manga,
});

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderLibrary = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Library />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

const SAMPLE = [
  tracked(1, "Caught Up", "271", "271", "reading", "2026-10-10T00:00:00Z"),
  tracked(2, "Chainsaw Man", "188", "191", "reading", "2026-10-13T00:00:00Z"),
  tracked(3, "Dandadan", "160", "164", "reading", "2026-10-12T00:00:00Z"),
  tracked(4, "Not Started", null, "62", "plan_to_read"),
  tracked(5, "Finished", "100", "100", "completed"),
];

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue(SAMPLE);
  recentChapters.mockResolvedValue([recent(2, "Chainsaw Man", "191", "https://x.test/191"), recent(3, "Dandadan", "Chapter 164", null)]);
  update.mockResolvedValue({});
  listAlerts.mockResolvedValue([]);
  markAlertRead.mockResolvedValue({});
});

const titles = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => /\. (Read|Not started)/.test(l ?? ""));

it("summarises the library and shows what is new", async () => {
  await renderLibrary();
  expect(await screen.findByText("NEW FOR YOU")).toBeTruthy();
  expect(screen.getByText(/5 tracked/)).toBeTruthy();
  expect(screen.getByText("2 new chapters")).toBeTruthy();
  // the bell counts everything unread in Updates: here the two new chapters
  expect(screen.getByRole("button", { name: "Updates, 2 new" })).toBeTruthy();
});

it("lists titles you are behind on first, with how many chapters behind", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  const rows = titles();
  expect(rows[0]).toMatch(/^Chainsaw Man\. Read Ch\. 188\. Latest Ch\. 191\. 3 unread\.$/);
  expect(rows[1]).toMatch(/^Dandadan\..*4 unread/);
  expect(screen.getByText("+3")).toBeTruthy();
  expect(screen.getByText("+4")).toBeTruthy();
});

it("shows 'Not started' instead of a misleading unread count when nothing has been read", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  expect(screen.getByRole("button", { name: /^Not Started\. Not started\. Latest Ch\. 62\.$/ })).toBeTruthy();
});

it("caps a very large unread count", async () => {
  list.mockResolvedValue([tracked(1, "Behind", "1", "500")]);
  await renderLibrary();
  expect(await screen.findByText("+99+")).toBeTruthy();
});

it("has a chip per status with counts, and hides statuses with none", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  expect(screen.getByRole("button", { name: "All, 5" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reading, 3" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Plan, 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Done, 1" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Dropped/ })).toBeNull();
});

it("filters the list when a chip is pressed", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  await fireEvent.press(screen.getByRole("button", { name: "Plan, 1" }));
  expect(titles()).toHaveLength(1);
  expect(titles()[0]).toMatch(/^Not Started/);
  expect(screen.getByRole("button", { name: "Plan, 1" }).props.accessibilityState.selected).toBe(true);
});

it("opens the chapter link from the rail, or the title when there is no link", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  await fireEvent.press(screen.getByRole("button", { name: "Chainsaw Man, Ch. 191, new" }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/191", BROWSER_OPTIONS);

  await fireEvent.press(screen.getByRole("button", { name: "Dandadan, Ch. 164, new" }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "3" } });
});

it("only shows chapters flagged as new in the rail; with none it says you are all caught up", async () => {
  recentChapters.mockResolvedValue([recent(2, "Chainsaw Man", "191", null, false)]);
  await renderLibrary();
  await screen.findByText(/5 tracked/);
  expect(screen.queryByText(/\d+ new chapters?/)).toBeNull();
  expect(screen.queryByRole("button", { name: /, new$/ })).toBeNull();
  expect(await screen.findByText("You're all caught up!")).toBeTruthy();
  expect(screen.getByText("NEW FOR YOU")).toBeTruthy();
});

describe("the all-caught-up message", () => {
  it("is not shown while there is something new", async () => {
    await renderLibrary();
    await screen.findByText("NEW FOR YOU");
    expect(screen.queryByText("You're all caught up!")).toBeNull();
  });

  it("is not shown before the new chapters have loaded", async () => {
    let finish!: (v: RecentChapter[]) => void;
    recentChapters.mockReturnValue(new Promise<RecentChapter[]>((resolve) => (finish = resolve)));
    await renderLibrary();
    await screen.findByText(/5 tracked/);
    expect(screen.queryByText("You're all caught up!")).toBeNull();
    await act(async () => finish([]));
    expect(await screen.findByText("You're all caught up!")).toBeTruthy();
  });

  it("is not shown when the new chapters could not be loaded, because then we do not know", async () => {
    recentChapters.mockRejectedValue(new Error("Network error."));
    await renderLibrary();
    await screen.findByText(/5 tracked/);
    expect(screen.queryByText("You're all caught up!")).toBeNull();
  });

  it("is not shown when nothing is being followed yet", async () => {
    list.mockResolvedValue([]);
    recentChapters.mockResolvedValue([]);
    await renderLibrary();
    await screen.findByText("Nothing here yet");
    expect(screen.queryByText("You're all caught up!")).toBeNull();
    expect(screen.queryByText("NEW FOR YOU")).toBeNull();
  });

  it("appears as soon as the last new chapter is read", async () => {
    recentChapters.mockResolvedValue([recent(2, "Chainsaw Man", "191", "https://x.test/191")]);
    update.mockImplementation(async () => {
      recentChapters.mockResolvedValue([]);
      return {};
    });
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Chainsaw Man, Ch. 191, new" }));
    expect(await screen.findByText("You're all caught up!")).toBeTruthy();
  });
});

it("opens a title from its row", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  await fireEvent.press(screen.getByRole("button", { name: /^Chainsaw Man\. Read/ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "2" } });
});

it("takes you to Updates from 'See all' and from the bell", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  await fireEvent.press(screen.getByRole("link", { name: "See all" }));
  expect(router.navigate).toHaveBeenCalledWith("/updates");
  (router.navigate as jest.Mock).mockClear();
  await fireEvent.press(screen.getByRole("button", { name: "Updates, 2 new" }));
  expect(router.navigate).toHaveBeenCalledWith("/updates");
});

describe("when there is nothing to show", () => {
  it("invites you to find a manga", async () => {
    list.mockResolvedValue([]);
    recentChapters.mockResolvedValue([]);
    await renderLibrary();
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByText(/0 tracked/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Find a manga" }));
    expect(router.navigate).toHaveBeenCalledWith("/search");
    expect(screen.queryByRole("button", { name: /^All,/ })).toBeNull(); // no chips for an empty library
  });

  it("says so when the selected filter no longer matches anything", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
    list.mockResolvedValue([tracked(1, "Reader", "1", "1"), tracked(2, "Planned", null, "5", "plan_to_read")]);
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={metrics}>
          <Library />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Plan, 1" }));
    expect(titles()).toHaveLength(1);

    // the planned title is stopped / removed elsewhere in the app, so the Plan filter is now empty
    await act(async () => client.setQueryData(["tracked"], [tracked(1, "Reader", "1", "1")]));
    expect(await screen.findByText("No titles here")).toBeTruthy();
    expect(screen.getByText('Nothing is marked "Plan" right now.')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plan, 0" })).toBeTruthy(); // the chip stays so the user can switch away
  });

  it("shows the saved library, not an error, when a refresh cannot reach the server", async () => {
    list.mockRejectedValue(new Error("Can't reach MangaPulse. Check your connection and try again later."));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(["tracked"], SAMPLE);
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={metrics}>
          <Library />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.getQueryState(["tracked"])?.status).toBe("error"));
    expect(screen.getByText(/5 tracked/)).toBeTruthy();
    expect(screen.queryByText("Couldn't load your library")).toBeNull();
  });

  it("explains a load failure and retries", async () => {
    list.mockRejectedValueOnce(new Error("Network error. Check your connection."));
    await renderLibrary();
    expect(await screen.findByText("Couldn't load your library")).toBeTruthy();
    expect(screen.getByText("Network error. Check your connection.")).toBeTruthy();

    list.mockResolvedValueOnce(SAMPLE);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/5 tracked/)).toBeTruthy();
  });
});

describe("marking a chapter as read from NEW FOR YOU", () => {
  const CARD = { name: "Chainsaw Man, Ch. 191, new" };
  const url = "https://x.test/191";

  /** After a successful save the server reports the title as caught up. */
  const serverCatchesUp = () =>
    update.mockImplementation(async () => {
      list.mockResolvedValue(SAMPLE.map((t) => (t.id === 2 ? { ...t, last_chapter_read: "191" } : t)));
      recentChapters.mockResolvedValue([recent(3, "Dandadan", "Chapter 164", null)]);
      return {};
    });

  it("opens the chapter and saves it as read, using the bare chapter number and the link", async () => {
    serverCatchesUp();
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", CARD));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url, BROWSER_OPTIONS);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(2, { last_chapter_read: "191", last_chapter_url: url });
  });

  it("saves 'Chapter 164' as 164, not the label", async () => {
    recentChapters.mockResolvedValue([recent(3, "Dandadan", "Chapter 164", "https://x.test/164")]);
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Dandadan, Ch. 164, new" }));
    expect(update).toHaveBeenCalledWith(3, { last_chapter_read: "164", last_chapter_url: "https://x.test/164" });
  });

  it("takes the card out of the rail and catches the row up, leaving other titles alone", async () => {
    serverCatchesUp();
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", CARD));

    await waitFor(() => expect(screen.queryByRole("button", CARD)).toBeNull());
    expect(screen.getByText("1 new chapter")).toBeTruthy();
    // the row no longer says it is behind
    expect(screen.getByRole("button", { name: /^Chainsaw Man\. Read Ch\. 191\. Latest Ch\. 191\.$/ })).toBeTruthy();
    expect(screen.queryByText("+3")).toBeNull();
    // the other new title is untouched
    expect(screen.getByRole("button", { name: "Dandadan, Ch. 164, new" })).toBeTruthy();
    expect(screen.getByText("+4")).toBeTruthy();
  });

  it("opens the chapter even while saving is still in flight", async () => {
    let finish!: () => void;
    update.mockReturnValue(new Promise((resolve) => (finish = () => resolve({}))));
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", CARD));
    // the save has not finished, yet the chapter is already open: reading never waits on the network
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url, BROWSER_OPTIONS);
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("puts everything back and tells the user when saving fails", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const toast = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    await renderLibrary();
    const card = await screen.findByRole("button", CARD);
    // Offline: the save fails AND the refresh afterwards fails, so nothing from the server can repair the screen.
    // Only the rollback can, which is what this test is for.
    update.mockRejectedValue(new Error("Network error."));
    list.mockRejectedValue(new Error("Network error."));
    recentChapters.mockRejectedValue(new Error("Network error."));
    await fireEvent.press(card);

    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't mark it as read. Check your connection and try again later.", ToastAndroid.LONG));
    // nothing was lost: the card is back and the row is still behind
    expect(await screen.findByRole("button", CARD)).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
    expect(screen.getByText("2 new chapters")).toBeTruthy();
    jest.restoreAllMocks();
  });

  it("does not save anything when there is no link to open; it goes to the title instead", async () => {
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Dandadan, Ch. 164, new" }));
    expect(update).not.toHaveBeenCalled();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "3" } });
  });

  describe("clearing the matching alerts", () => {
    /** The server's alerts; marking one read flips it, and the unread-only list drops it. */
    const serverAlerts = (initial: AppNotification[]) => {
      let all = initial;
      listAlerts.mockImplementation(async (opts?: { unreadOnly?: boolean }) => (opts?.unreadOnly ? all.filter((n) => !n.is_read) : all));
      markAlertRead.mockImplementation(async (id: number) => {
        all = all.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        return {};
      });
    };

    it("marks this title's alerts up to the tapped chapter as read, and nothing else", async () => {
      serverAlerts([
        alert(10, 2, "Chapter 190"), // same title, older: settled by reading 191
        alert(11, 2, "191"), // same title, this chapter
        alert(12, 2, "Chapter 192"), // same title, newer: still unread
        alert(13, 3, "Chapter 164"), // different title: untouched
      ]);
      serverCatchesUp();
      await renderLibrary();
      expect(await screen.findByRole("button", { name: "Updates, 4 new" })).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: CARD.name }));

      await waitFor(() => expect(markAlertRead).toHaveBeenCalledTimes(2));
      expect(markAlertRead.mock.calls.map((c) => c[0]).sort()).toEqual([10, 11]);
      expect(await screen.findByRole("button", { name: "Updates, 2 new" })).toBeTruthy();
    });

    it("does not touch alerts when saving the chapter fails", async () => {
      serverAlerts([alert(10, 2, "191")]);
      update.mockRejectedValue(new Error("Network error."));
      await renderLibrary();
      await fireEvent.press(await screen.findByRole("button", CARD));
      await waitFor(() => expect(update).toHaveBeenCalled());
      await act(async () => {});
      expect(markAlertRead).not.toHaveBeenCalled();
    });

    it("keeps the chapter saved even if clearing the alerts fails", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      serverAlerts([alert(10, 2, "191")]);
      markAlertRead.mockRejectedValue(new Error("boom"));
      serverCatchesUp();
      await renderLibrary();
      await fireEvent.press(await screen.findByRole("button", CARD));

      await waitFor(() => expect(markAlertRead).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("button", CARD)).toBeNull());
      expect(screen.getByRole("button", { name: /^Chainsaw Man\. Read Ch\. 191\./ })).toBeTruthy();
      jest.restoreAllMocks();
    });

    it("keeps the chapter saved even if the alerts cannot be loaded", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      listAlerts.mockRejectedValue(new Error("offline"));
      serverCatchesUp();
      await renderLibrary();
      await fireEvent.press(await screen.findByRole("button", CARD));
      await waitFor(() => expect(listAlerts).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("button", CARD)).toBeNull());
      expect(markAlertRead).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });
});
