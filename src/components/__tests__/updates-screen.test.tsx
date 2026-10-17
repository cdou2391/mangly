import { Alert, Platform, ToastAndroid } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Updates from "@/app/(tabs)/updates";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import type { AppNotification, RecentChapter, TrackedManga } from "@/api/types";

jest.mock("@/api/endpoints", () => ({
  trackingApi: { list: jest.fn(), recentChapters: jest.fn(), update: jest.fn() },
  notificationsApi: { list: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn(), clearRead: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const listTracked = trackingApi.list as jest.Mock;
const recentChapters = trackingApi.recentChapters as jest.Mock;
const update = trackingApi.update as jest.Mock;
const listAlerts = notificationsApi.list as jest.Mock;
const markAlertRead = notificationsApi.markRead as jest.Mock;
const markAllAlertsRead = notificationsApi.markAllRead as jest.Mock;
const clearReadAlerts = notificationsApi.clearRead as jest.Mock;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const NOW = new Date().toISOString();

const tracked = (mangaId: number, name: string): TrackedManga =>
  ({ id: mangaId * 10, manga_id: mangaId, manga: { id: mangaId, canonical_name: name } }) as TrackedManga;
const alert = (id: number, mangaId: number, name: string, chapter: string, when: string, isRead = false): AppNotification => ({
  id, user_id: 1, manga_id: mangaId, source_record_id: null, chapter_released: chapter, latest_chapter_url: `https://x.test/${mangaId}/${chapter}`,
  source: "mangaread", is_read: isRead, created_at: when,
  manga: { id: mangaId, canonical_name: name, cover_url: null } as AppNotification["manga"],
});
const latest = (mangaId: number, name: string, chapter: string, when: string, isNew: boolean, url: string | null = `https://x.test/${mangaId}/${chapter}`): RecentChapter => ({
  tracking_id: mangaId * 10, manga_id: mangaId, manga_title: name, manga_cover_url: null, chapter, chapter_url: url, chapter_at: when, source: "weebcentral", is_new: isNew,
});

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderUpdates = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Updates />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

/** A little server: alerts and latest chapters that react to what the app saves. */
function server(alerts: AppNotification[], recent: RecentChapter[]) {
  let a = alerts;
  let r = recent;
  listAlerts.mockImplementation(async (opts?: { unreadOnly?: boolean }) => (opts?.unreadOnly ? a.filter((n) => !n.is_read) : a));
  recentChapters.mockImplementation(async () => r);
  markAlertRead.mockImplementation(async (id: number) => {
    const n = a.find((x) => x.id === id)!;
    a = a.map((x) => (x.id === id ? { ...x, is_read: true } : x));
    r = r.map((c) => (c.manga_id === n.manga_id && parseFloat(n.chapter_released) >= parseFloat(c.chapter) ? { ...c, is_new: false } : c)); // server advances progress
    return {};
  });
  markAllAlertsRead.mockImplementation(async () => {
    a = a.map((x) => ({ ...x, is_read: true }));
    return {};
  });
  update.mockImplementation(async (trackingId: number) => {
    r = r.map((c) => (c.tracking_id === trackingId ? { ...c, is_new: false } : c));
    return {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  listTracked.mockResolvedValue([tracked(1, "Chainsaw Man"), tracked(2, "Dandadan"), tracked(3, "One Piece"), tracked(4, "Blue Lock")]);
  server(
    [
      alert(11, 1, "Chainsaw Man", "191", NOW),
      alert(12, 1, "Chainsaw Man", "190", at(1 * DAY)),
      alert(13, 3, "One Piece", "1128", at(3 * DAY), true),
    ],
    [
      latest(1, "Chainsaw Man", "191", NOW, true),
      latest(2, "Dandadan", "164", at(2 * HOUR), true), // notifications off for this title: no alert behind it
      latest(3, "One Piece", "1128", at(3 * DAY), false),
    ],
  );
});

const row = (name: RegExp) => screen.findByRole("button", { name });

describe("the feed", () => {
  it("merges alerts and latest chapters, newest first, grouped by day", async () => {
    await renderUpdates();
    await row(/^Chainsaw Man\. Ch\. 191/);
    expect(screen.getByText("TODAY")).toBeTruthy();
    expect(screen.getByText("YESTERDAY")).toBeTruthy();
    expect(screen.getByText("EARLIER THIS WEEK")).toBeTruthy();
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => /\. (new|read)\b/.test(l ?? ""));
    expect(labels.map((l) => l.replace(/^(.+?)\. (Ch\. \S+)\..*$/, "$1 $2"))).toEqual(["Chainsaw Man Ch. 191", "Dandadan Ch. 164", "Chainsaw Man Ch. 190", "One Piece Ch. 1128"]);
  });

  it("shows each chapter once, even when an alert and a latest-chapter entry describe it", async () => {
    await renderUpdates();
    await row(/^Chainsaw Man\. Ch\. 191/);
    expect(screen.getAllByRole("button", { name: /^Chainsaw Man\. Ch\. 191/ })).toHaveLength(1);
  });

  it("marks unread ones NEW and read ones as read, and says how many are new", async () => {
    await renderUpdates();
    expect(await row(/^Chainsaw Man\. Ch\. 191\..*\bnew\b/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^One Piece\. Ch\. 1128\..*\bread\b/ })).toBeTruthy();
    expect(screen.getByText("3 new")).toBeTruthy();
    expect(screen.getByText(/· 4 recent/)).toBeTruthy();
    expect(screen.getAllByText("NEW")).toHaveLength(3);
  });

  it("filters to what is new", async () => {
    await renderUpdates();
    await row(/^One Piece/);
    expect(screen.getByRole("button", { name: "All, 4" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New, 3" }));
    expect(screen.queryByRole("button", { name: /^One Piece/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Dandadan/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New, 3" }).props.accessibilityState.selected).toBe(true);
  });

  it("does not list alerts for titles you no longer track", async () => {
    server([alert(11, 1, "Chainsaw Man", "191", NOW), alert(14, 9, "Dropped Title", "5", NOW)], [latest(1, "Chainsaw Man", "191", NOW, true)]);
    await renderUpdates();
    await row(/^Chainsaw Man\. Ch\. 191/);
    expect(screen.queryByRole("button", { name: /^Dropped Title/ })).toBeNull();
  });

  it("says you are all caught up when nothing is new, and offers no mark-all", async () => {
    server([alert(13, 3, "One Piece", "1128", at(3 * DAY), true)], [latest(3, "One Piece", "1128", at(3 * DAY), false)]);
    await renderUpdates();
    expect(await screen.findByText("You're all caught up")).toBeTruthy(); // header
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "New, 0" }));
    expect(await screen.findByText("You're all caught up!")).toBeTruthy(); // empty New view
    expect(screen.queryByRole("button", { name: /^One Piece/ })).toBeNull();
  });

  it("invites you to track something when there is nothing at all", async () => {
    server([], []);
    listTracked.mockResolvedValue([]);
    await renderUpdates();
    expect(await screen.findByText("Nothing yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^All,/ })).toBeNull();
  });
});

describe("loading and failing", () => {
  it("explains a failure when nothing could be loaded, and retries", async () => {
    listAlerts.mockRejectedValue(new Error("Network error."));
    recentChapters.mockRejectedValue(new Error("Network error."));
    await renderUpdates();
    expect(await screen.findByText("Couldn't load your updates")).toBeTruthy();
    server([], [latest(2, "Dandadan", "164", NOW, true)]);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await row(/^Dandadan/)).toBeTruthy();
  });

  it("still shows what loaded when only one of the two lists fails", async () => {
    listAlerts.mockRejectedValue(new Error("Network error."));
    await renderUpdates();
    expect(await row(/^Dandadan\. Ch\. 164/)).toBeTruthy();
    expect(screen.queryByText("Couldn't load your updates")).toBeNull();
  });
});

describe("opening a chapter", () => {
  it("an unread alert opens the chapter and is marked read; the server moves the progress, so the app does not", async () => {
    await renderUpdates();
    await fireEvent.press(await row(/^Chainsaw Man\. Ch\. 191/));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/1/191");
    expect(markAlertRead).toHaveBeenCalledWith(11);
    expect(update).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Chainsaw Man\. Ch\. 191\..*\bread\b/ })).toBeTruthy());
    expect(screen.getByText("1 new")).toBeTruthy(); // 191 and the older 190 alert are both settled; Dandadan remains
  });

  it("reading a chapter also settles the older alerts of the same title, but not other titles", async () => {
    await renderUpdates();
    await fireEvent.press(await row(/^Chainsaw Man\. Ch\. 191/));
    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith(12)); // 190 is behind 191
    expect(markAlertRead).not.toHaveBeenCalledWith(13);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Chainsaw Man\. Ch\. 190\..*\bread\b/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: /^Dandadan\..*\bnew\b/ })).toBeTruthy();
  });

  it("opening an older alert does not make a newer chapter of the same title look read, even before the server answers", async () => {
    let answer!: () => void;
    markAlertRead.mockReturnValue(new Promise((resolve) => (answer = () => resolve({}))));
    await renderUpdates();
    await fireEvent.press(await row(/^Chainsaw Man\. Ch\. 190/));
    try {
      expect(markAlertRead).toHaveBeenCalledWith(12);
      // The save is still in flight, so this is the screen's own (optimistic) view. It is applied once any refresh already
      // under way has been cancelled, which on a slow machine can be a moment after the press, so wait for it.
      await waitFor(() => expect(screen.getByRole("button", { name: /^Chainsaw Man\. Ch\. 190\..*\bread\b/ })).toBeTruthy());
      expect(screen.getByRole("button", { name: /^Chainsaw Man\. Ch\. 191\..*\bnew\b/ })).toBeTruthy();
    } finally {
      await act(async () => answer()); // never leave the save hanging, even when an assertion above fails
    }
  });

  it("a latest chapter with no alert behind it is saved as the title's progress", async () => {
    await renderUpdates();
    await fireEvent.press(await row(/^Dandadan\. Ch\. 164/));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/2/164");
    expect(update).toHaveBeenCalledWith(20, { last_chapter_read: "164", last_chapter_url: "https://x.test/2/164" });
    expect(markAlertRead).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Dandadan\..*\bread\b/ })).toBeTruthy());
  });

  it("opens something already read without saving anything", async () => {
    await renderUpdates();
    await fireEvent.press(await row(/^One Piece/));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/3/1128");
    expect(update).not.toHaveBeenCalled();
    expect(markAlertRead).not.toHaveBeenCalled();
  });

  it("goes to the title when there is no link, without saving", async () => {
    server([], [latest(2, "Dandadan", "164", NOW, true, null)]);
    await renderUpdates();
    await fireEvent.press(await row(/^Dandadan/));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "20" } });
    expect(update).not.toHaveBeenCalled();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it("puts the item back and tells the user when saving fails", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const toast = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    await renderUpdates();
    const item = await row(/^Chainsaw Man\. Ch\. 191/);
    // offline: the save fails and so does the refresh after it, so only the rollback can repair the screen
    markAlertRead.mockRejectedValue(new Error("Network error."));
    listAlerts.mockRejectedValue(new Error("Network error."));
    recentChapters.mockRejectedValue(new Error("Network error."));
    listTracked.mockRejectedValue(new Error("Network error."));
    await fireEvent.press(item);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't mark it as read. Check your connection and try again later.", ToastAndroid.LONG));
    expect(await row(/^Chainsaw Man\. Ch\. 191\..*\bnew\b/)).toBeTruthy();
    expect(screen.getByText("3 new")).toBeTruthy();
    jest.restoreAllMocks();
  });
});

describe("mark all read", () => {
  /** The confirmation dialog: press the button with this label. */
  const answer = async (label: string) => {
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === label)!.onPress?.());
  };

  let dialog: jest.SpyInstance;
  beforeEach(() => {
    dialog = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => dialog.mockRestore());

  it("asks first, because it moves reading progress", async () => {
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark all read" }));
    expect(Alert.alert).toHaveBeenCalledWith("Mark everything as read?", expect.stringContaining("progress"), expect.any(Array));
    expect(update).not.toHaveBeenCalled();
    await answer("Cancel");
    expect(update).not.toHaveBeenCalled();
    expect(markAllAlertsRead).not.toHaveBeenCalled();
  });

  it("moves every new title to its latest chapter, marks every alert read, and clears the NEW marks", async () => {
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark all read" }));
    await answer("Mark all read");
    await waitFor(() => expect(markAllAlertsRead).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledTimes(2); // Chainsaw Man and Dandadan; One Piece was already read
    expect(update).toHaveBeenCalledWith(10, { last_chapter_read: "191", last_chapter_url: "https://x.test/1/191" });
    expect(update).toHaveBeenCalledWith(20, { last_chapter_read: "164", last_chapter_url: "https://x.test/2/164" });
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    expect(screen.queryAllByText("NEW")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
  });

  it("puts everything back and tells the user when something could not be saved", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const toast = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark all read" }));
    update.mockRejectedValue(new Error("Network error.")); // one title cannot be saved ...
    listAlerts.mockRejectedValue(new Error("Network error.")); // ... and the refresh cannot repair the screen
    recentChapters.mockRejectedValue(new Error("Network error."));
    listTracked.mockRejectedValue(new Error("Network error."));
    await answer("Mark all read");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't mark everything as read. Check your connection and try again later.", ToastAndroid.LONG));
    expect(await row(/^Chainsaw Man\. Ch\. 191\..*\bnew\b/)).toBeTruthy();
    expect(screen.getByText("3 new")).toBeTruthy();
    toast.mockRestore();
  });
});

describe("clear read alerts", () => {
  const answer = async (label: string) => {
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === label)!.onPress?.());
  };
  let dialog: jest.SpyInstance;
  beforeEach(() => {
    dialog = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => dialog.mockRestore());

  /** Two read alerts: one for the newest One Piece chapter (the feed shows it anyway), one for an older chapter. */
  const withHistory = () => {
    let a = [
      alert(11, 1, "Chainsaw Man", "191", NOW),
      alert(13, 3, "One Piece", "1128", at(3 * DAY), true),
      alert(14, 3, "One Piece", "1127", at(4 * DAY), true),
    ];
    server(a, [latest(1, "Chainsaw Man", "191", NOW, true), latest(3, "One Piece", "1128", at(3 * DAY), false)]);
    listAlerts.mockImplementation(async () => a);
    clearReadAlerts.mockImplementation(async () => {
      a = a.filter((n) => !n.is_read);
      return { deleted: 2 };
    });
  };

  it("is offered next to Mark all read when there are read alerts", async () => {
    await renderUpdates();
    expect(await screen.findByRole("button", { name: "Clear read alerts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeTruthy();
  });

  it("is offered even when everything is read, and not at all when no alert has been read", async () => {
    server([alert(11, 1, "Chainsaw Man", "191", NOW)], [latest(1, "Chainsaw Man", "191", NOW, true)]);
    await renderUpdates();
    await row(/^Chainsaw Man/);
    expect(screen.queryByRole("button", { name: "Clear read alerts" })).toBeNull();
  });

  it("asks first, saying how many will go and that nothing unread or any progress is touched", async () => {
    withHistory();
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear read alerts" }));
    expect(Alert.alert).toHaveBeenCalledWith("Clear read alerts?", expect.stringContaining("2 alerts you've already read"), expect.any(Array));
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)![1]).toMatch(/Unread chapters and your reading progress are not touched/);
    await answer("Cancel");
    expect(clearReadAlerts).not.toHaveBeenCalled();
  });

  it("says 'alert' for one", async () => {
    server([alert(13, 3, "One Piece", "1128", at(3 * DAY), true)], [latest(3, "One Piece", "1128", at(3 * DAY), false)]);
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear read alerts" }));
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)![1]).toMatch(/^1 alert you've already read/);
  });

  it("removes the read alerts from the history once confirmed, and the button goes away", async () => {
    withHistory();
    await renderUpdates();
    expect(await row(/^One Piece\. Ch\. 1127/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear read alerts" }));
    await answer("Clear");
    await waitFor(() => expect(clearReadAlerts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^One Piece\. Ch\. 1127/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^One Piece\. Ch\. 1128/ })).toBeTruthy(); // the newest chapter still shows: it comes from the title
    expect(screen.queryByRole("button", { name: "Clear read alerts" })).toBeNull();
  });

  it("takes the read alerts off the screen at once, before the server has answered", async () => {
    withHistory();
    let finish!: () => void;
    clearReadAlerts.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ deleted: 2 }))));
    await renderUpdates();
    expect(await row(/^One Piece\. Ch\. 1127/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear read alerts" }));
    await answer("Clear");
    await waitFor(() => expect(screen.queryByRole("button", { name: /^One Piece\. Ch\. 1127/ })).toBeNull());
    expect(clearReadAlerts).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("leaves unread chapters and reading progress alone", async () => {
    withHistory();
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear read alerts" }));
    await answer("Clear");
    await waitFor(() => expect(clearReadAlerts).toHaveBeenCalled());
    expect(await row(/^Chainsaw Man\. Ch\. 191\..*\bnew\b/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    expect(markAlertRead).not.toHaveBeenCalled();
    expect(markAllAlertsRead).not.toHaveBeenCalled();
  });

  it("puts the alerts back and tells the user when it cannot be done", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const toast = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    withHistory();
    await renderUpdates();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear read alerts" }));
    clearReadAlerts.mockRejectedValue(new Error("Network error."));
    listAlerts.mockRejectedValue(new Error("Network error.")); // the refresh cannot repair the screen either (offline)
    await answer("Clear");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't clear your read alerts. Check your connection and try again later.", ToastAndroid.LONG));
    expect(await row(/^One Piece\. Ch\. 1127/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear read alerts" })).toBeTruthy();
    toast.mockRestore();
  });
});
