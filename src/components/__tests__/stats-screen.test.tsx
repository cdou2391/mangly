import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import Stats from "@/app/stats";
import { trackingApi } from "@/api/endpoints";
import type { TrackedManga } from "@/api/types";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn() } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));

const list = trackingApi.list as jest.Mock;
const NOW = new Date().toISOString();

let id = 0;
function item(over: Partial<TrackedManga> = {}, manga: Partial<TrackedManga["manga"]> = {}, source = "mangaread"): TrackedManga {
  id += 1;
  return {
    id, user_id: 1, manga_id: id, preferred_source_record_id: 1, last_chapter_read: "10", last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: null, created_at: "2025-01-01T00:00:00Z", updated_at: NOW,
    manga: { id, canonical_name: `Title ${id}`, genres: [], author: null, summary: null, cover_url: null, latest_chapter: "10", latest_chapter_url: null, global_status: "ongoing", created_at: "", updated_at: "", ...manga },
    preferred_source_record: { source } as TrackedManga["preferred_source_record"],
    ...over,
  } as TrackedManga;
}

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderStats = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Stats />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  id = 0;
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  list.mockResolvedValue([
    item({ last_chapter_read: "90", rating: 5, reading_status: "reading", created_at: NOW }, { latest_chapter: "100", canonical_name: "Berserk", genres: ["Action", "Dark Fantasy"] }),
    item({ last_chapter_read: "10", rating: 3, reading_status: "completed" }, { latest_chapter: "10", genres: ["Action"] }, "weebcentral"),
    item({ last_chapter_read: "1", rating: null, reading_status: "plan_to_read" }, { latest_chapter: "31", canonical_name: "Dandadan" }),
  ]);
});

describe("the numbers", () => {
  it("shows the figures at the top", async () => {
    await renderStats();
    expect(await screen.findByLabelText("Titles: 3, 1 added in the last 30 days")).toBeTruthy();
    expect(screen.getByLabelText("Chapters read: 101, Counted from your last chapter in each title")).toBeTruthy();
    expect(screen.getByLabelText("Chapters to catch up: 40, Across 2 titles")).toBeTruthy();
    expect(screen.getByLabelText("Average rating: 4.0, 2 titles rated, out of 5")).toBeTruthy();
  });

  it("shows the status split, with counts", async () => {
    await renderStats();
    expect(await screen.findByText("Reading · 1")).toBeTruthy();
    expect(screen.getByText("Completed · 1")).toBeTruthy();
    expect(screen.getByText("Plan to read · 1")).toBeTruthy();
    expect(screen.queryByText(/Dropped/)).toBeNull(); // nothing dropped: not listed
  });

  it("shows how you rate, five stars first", async () => {
    await renderStats();
    expect(await screen.findByLabelText("5 stars: 1")).toBeTruthy();
    expect(screen.getByLabelText("3 stars: 1")).toBeTruthy();
    expect(screen.getByLabelText("1 star: 0")).toBeTruthy();
  });

  it("shows the most common genres and the sites", async () => {
    await renderStats();
    expect(await screen.findByLabelText("Action: 2")).toBeTruthy();
    expect(screen.getByLabelText("Dark Fantasy: 1")).toBeTruthy();
    expect(screen.getByLabelText("MangaRead: 2")).toBeTruthy();
    expect(screen.getByLabelText("WeebCentral: 1")).toBeTruthy();
  });

  it("lists the titles furthest behind and opens one", async () => {
    await renderStats();
    const dandadan = await screen.findByRole("button", { name: "Dandadan, 30 chapters behind" });
    expect(screen.getByRole("button", { name: "Berserk, 10 chapters behind" })).toBeTruthy();
    await fireEvent.press(dandadan);
    expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "3" } });
  });
});

describe("with little to show", () => {
  it("invites you to rate when nothing is rated, and hides genres and 'behind' when there are none", async () => {
    list.mockResolvedValue([item()]);
    await renderStats();
    expect(await screen.findByText("Rate the titles you've read to see how you score them.")).toBeTruthy();
    expect(screen.getByLabelText("Average rating: –, Nothing rated yet")).toBeTruthy();
    expect(screen.getByLabelText("Chapters to catch up: 0, You're all caught up")).toBeTruthy();
    expect(screen.queryByText("TOP GENRES")).toBeNull();
    expect(screen.queryByText("FURTHEST BEHIND")).toBeNull();
  });

  it("says there is nothing to count for an empty library", async () => {
    list.mockResolvedValue([]);
    await renderStats();
    expect(await screen.findByText("Nothing to count yet")).toBeTruthy();
    expect(screen.queryByText("STATUS")).toBeNull();
  });
});

describe("loading and failing", () => {
  it("keeps the back button on a failure and retries on request", async () => {
    list.mockRejectedValueOnce(new Error("Network error. Check your connection."));
    await renderStats();
    expect(await screen.findByText("Couldn't load your stats")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText(/^Titles: 3/)).toBeTruthy();
  });

  it("has a back button while loading", async () => {
    list.mockReturnValue(new Promise(() => {}));
    await renderStats();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });
});
