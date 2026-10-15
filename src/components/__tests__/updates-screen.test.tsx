import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Updates from "@/app/(tabs)/updates";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import type { RecentChapter } from "@/api/types";

jest.mock("@/api/endpoints", () => ({
  trackingApi: { recentChapters: jest.fn(), update: jest.fn() },
  notificationsApi: { list: jest.fn(), markRead: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const recentChapters = trackingApi.recentChapters as jest.Mock;
const update = trackingApi.update as jest.Mock;
const listAlerts = notificationsApi.list as jest.Mock;

const NOW = "2026-10-14T12:00:00Z";
const recent = (id: number, title: string, chapter: string, url: string | null, isNew: boolean): RecentChapter => ({
  tracking_id: id, manga_id: id, manga_title: title, manga_cover_url: null, chapter, chapter_url: url, chapter_at: NOW, source: "mangaread", is_new: isNew,
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

beforeEach(() => {
  jest.clearAllMocks();
  recentChapters.mockResolvedValue([
    recent(2, "Chainsaw Man", "191", "https://x.test/191", true),
    recent(3, "Dandadan", "164", "https://x.test/164", false),
    recent(4, "No Link", "7", null, true),
  ]);
  update.mockResolvedValue({});
  listAlerts.mockResolvedValue([]);
});

it("opens a new chapter and saves it as read", async () => {
  update.mockImplementation(async () => {
    recentChapters.mockResolvedValue([
      recent(2, "Chainsaw Man", "191", "https://x.test/191", false),
      recent(3, "Dandadan", "164", "https://x.test/164", false),
      recent(4, "No Link", "7", null, true),
    ]);
    return {};
  });
  await renderUpdates();
  await fireEvent.press(await screen.findByRole("button", { name: /Chainsaw Man/ }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/191");
  expect(update).toHaveBeenCalledWith(2, { last_chapter_read: "191", last_chapter_url: "https://x.test/191" });
  await waitFor(() => expect(screen.getAllByText("NEW")).toHaveLength(1)); // the badge on the row goes away at once
});

it("opens a chapter that was already read without saving anything", async () => {
  await renderUpdates();
  await fireEvent.press(await screen.findByRole("button", { name: /Dandadan/ }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/164");
  expect(update).not.toHaveBeenCalled();
});

it("goes to the title when there is no link, without saving", async () => {
  await renderUpdates();
  await fireEvent.press(await screen.findByRole("button", { name: /No Link/ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "4" } });
  expect(update).not.toHaveBeenCalled();
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
});
