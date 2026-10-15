import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import MangaDetail from "@/app/manga/[id]";
import { trackingApi } from "@/api/endpoints";
import type { TrackedManga } from "@/api/types";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn(), update: jest.fn(), remove: jest.fn() } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const update = trackingApi.update as jest.Mock;
const remove = trackingApi.remove as jest.Mock;

const NOW = "2026-10-14T12:00:00Z";
function item(over: Partial<TrackedManga> = {}, manga: Partial<TrackedManga["manga"]> = {}): TrackedManga {
  return {
    id: 44, user_id: 1, manga_id: 4, preferred_source_record_id: 9, last_chapter_read: "698", last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: null, created_at: NOW, updated_at: NOW,
    manga: { id: 4, canonical_name: "Naruto", genres: null, author: "KISHIMOTO Masashi", summary: "A kid wants to be Hokage.", cover_url: null, latest_chapter: "Chapter 700.5", latest_chapter_url: "https://x.test/700.5", global_status: "unknown", created_at: NOW, updated_at: NOW, ...manga },
    preferred_source_record: { id: 9, manga_id: 4, source: "mangaread", source_title: "Naruto", manga_details_url: "https://x.test/naruto/", latest_chapter: "Chapter 700.5", latest_chapter_url: "https://x.test/latest", latest_chapter_at: NOW, last_scraped_at: NOW },
    ...over,
  } as TrackedManga;
}

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderDetail = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <MangaDetail />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "44" });
  list.mockResolvedValue([item()]);
  update.mockResolvedValue({});
  remove.mockResolvedValue(undefined);
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe("the page", () => {
  it("shows what you read and what is latest, the site, and hides an unknown status", async () => {
    await renderDetail();
    expect(await screen.findByText("Naruto")).toBeTruthy();
    expect(screen.getByText("KISHIMOTO Masashi")).toBeTruthy();
    expect(screen.getByText("Ch. 698")).toBeTruthy();
    expect(screen.getByText("Ch. 700.5")).toBeTruthy();
    expect(screen.getByText("MangaRead")).toBeTruthy();
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("shows a known status", async () => {
    list.mockResolvedValue([item({}, { global_status: "ongoing" })]);
    await renderDetail();
    expect(await screen.findByText("Ongoing")).toBeTruthy();
  });

  it("has a back button, with no platform header bar", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalled();
  });

  it("goes to the library when there is nothing to go back to", async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(router.replace).toHaveBeenCalledWith("/library");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("keeps the back button while loading, on a load failure and when the title is gone", async () => {
    list.mockRejectedValue(new Error("Network error."));
    await renderDetail();
    expect(await screen.findByText("Couldn't load this title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("says when the title is no longer in the library", async () => {
    list.mockResolvedValue([item({ id: 99 })]);
    await renderDetail();
    expect(await screen.findByText("Not in your library")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("collapses a long summary until asked", async () => {
    list.mockResolvedValue([item({}, { summary: "word ".repeat(80) })]);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("does not offer 'Read more' for a short summary", async () => {
    await renderDetail();
    await screen.findByText("Naruto");
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
  });
});

describe("reading", () => {
  it("opens the latest chapter", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read latest chapter" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/latest");
  });

  it("marks the latest chapter as read, saving the bare number the way the web app does", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Mark Ch. 700.5 as read" }));
    expect(update).toHaveBeenCalledWith(44, { last_chapter_read: "700.5", last_chapter_url: "https://x.test/700.5" });
  });

  it("offers no 'mark as read' once you are caught up, however the chapter is written", async () => {
    list.mockResolvedValue([item({ last_chapter_read: "700.5" })]); // saved as "700.5", latest is "Chapter 700.5"
    await renderDetail();
    await screen.findByText("Naruto");
    expect(screen.queryByRole("button", { name: /^Mark / })).toBeNull();
  });

  it("offers it when you have not started", async () => {
    list.mockResolvedValue([item({ last_chapter_read: null })]);
    await renderDetail();
    expect(await screen.findByText("Not started")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Mark / })).toBeTruthy();
  });
});

describe("changing the title", () => {
  it("sets the reading status, marking the current one", async () => {
    await renderDetail();
    expect((await screen.findByRole("button", { name: "Reading" })).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Completed" }));
    expect(update).toHaveBeenCalledWith(44, { reading_status: "completed" });
  });

  it("does nothing when the current status is pressed again", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Reading" }));
    expect(update).not.toHaveBeenCalled();
  });

  it("turns alerts off and on with the switch", async () => {
    await renderDetail();
    const sw = await screen.findByLabelText("New chapter alerts");
    await fireEvent(sw, "valueChange", false);
    expect(update).toHaveBeenCalledWith(44, { notifications_enabled: false });
  });

  it("shows why a change failed", async () => {
    update.mockRejectedValue(new Error("Network error. Check your connection."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Completed" }));
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
  });
});

describe("removing", () => {
  beforeEach(() => jest.spyOn(Alert, "alert").mockImplementation(() => {}));
  afterEach(() => (Alert.alert as jest.Mock).mockRestore());

  const answer = async (label: string) => {
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === label)!.onPress?.());
  };

  it("asks first, and does nothing if cancelled", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    expect(Alert.alert).toHaveBeenCalledWith("Remove from library?", expect.any(String), expect.any(Array));
    await answer("Cancel");
    expect(remove).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("removes it and goes back once confirmed, without flashing 'not in your library'", async () => {
    list.mockResolvedValueOnce([item()]).mockResolvedValue([]);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    await answer("Remove");
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => {}); // let the emptied library list render: the screen is still on show until the navigation happens
    expect(screen.queryByText("Not in your library")).toBeNull();
  });

  it("shows why removing failed and stays on the page", async () => {
    remove.mockRejectedValue(new Error("Network error. Check your connection."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    await answer("Remove");
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText("Naruto")).toBeTruthy();
  });
});
