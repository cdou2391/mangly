import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Library from "@/app/(tabs)/library";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import type { RecentChapter, TrackedManga } from "@/api/types";

jest.mock("@/api/endpoints", () => ({
  trackingApi: { list: jest.fn(), recentChapters: jest.fn() },
  notificationsApi: { unreadCount: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const recentChapters = trackingApi.recentChapters as jest.Mock;
const unreadCount = notificationsApi.unreadCount as jest.Mock;

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

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderLibrary = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
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
  unreadCount.mockResolvedValue({ count: 3 });
});

const titles = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => /\. (Read|Not started)/.test(l ?? ""));

it("summarises the library and shows what is new", async () => {
  await renderLibrary();
  expect(await screen.findByText("NEW FOR YOU")).toBeTruthy();
  expect(screen.getByText(/5 tracked/)).toBeTruthy();
  expect(screen.getByText("2 new chapters")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Alerts, 3 unread" })).toBeTruthy();
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
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/191");

  await fireEvent.press(screen.getByRole("button", { name: "Dandadan, Ch. 164, new" }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "3" } });
});

it("only shows chapters flagged as new in the rail, and hides the rail when there are none", async () => {
  recentChapters.mockResolvedValue([recent(2, "Chainsaw Man", "191", null, false)]);
  await renderLibrary();
  await screen.findByText(/5 tracked/);
  expect(screen.queryByText("NEW FOR YOU")).toBeNull();
  expect(screen.queryByText(/new chapter/)).toBeNull();
});

it("opens a title from its row", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  await fireEvent.press(screen.getByRole("button", { name: /^Chainsaw Man\. Read/ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "2" } });
});

it("takes you to Updates from 'See all' and to Alerts from the bell", async () => {
  await renderLibrary();
  await screen.findByText("NEW FOR YOU");
  await fireEvent.press(screen.getByRole("link", { name: "See all" }));
  expect(router.navigate).toHaveBeenCalledWith("/updates");
  await fireEvent.press(screen.getByRole("button", { name: "Alerts, 3 unread" }));
  expect(router.navigate).toHaveBeenCalledWith("/notifications");
});

describe("when there is nothing to show", () => {
  it("invites you to find a manga", async () => {
    list.mockResolvedValue([]);
    recentChapters.mockResolvedValue([]);
    unreadCount.mockResolvedValue({ count: 0 });
    await renderLibrary();
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByText(/0 tracked/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Find a manga" }));
    expect(router.navigate).toHaveBeenCalledWith("/search");
    expect(screen.queryByRole("button", { name: /^All,/ })).toBeNull(); // no chips for an empty library
  });

  it("says so when the selected filter no longer matches anything", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
