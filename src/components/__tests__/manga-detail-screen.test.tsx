import { Alert, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import MangaDetail from "@/app/manga/[id]";
import { trackingApi } from "@/api/endpoints";
import { ApiError } from "@/api/client";
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
const renderDetail = (client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })) =>
  render(
    <QueryClientProvider client={client}>
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

  it("asks the user to try again later when the server cannot be reached", async () => {
    update.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Completed" }));
    expect(await screen.findByText("Can't reach MangaPulse. Check your connection and try again later.")).toBeTruthy();
  });

  it("shows why a change failed", async () => {
    update.mockRejectedValue(new Error("Network error. Check your connection."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Completed" }));
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
  });
});

describe("the rating", () => {
  /** A server that keeps what it is sent: the next time the library is read, the rating is what was last saved. */
  const serverKeepsRatings = (start: number | null = null) => {
    let saved = start;
    list.mockImplementation(async () => [item({ rating: saved })]);
    update.mockImplementation(async (_id: number, body: { rating?: number | null }) => {
      if ("rating" in body) saved = body.rating ?? null;
      return {};
    });
  };
  const stars = () => [1, 2, 3, 4, 5].map((n) => screen.getByRole("radio", { name: n === 1 ? "Rate 1 star" : `Rate ${n} stars` }));

  /** Which stars are lit: a lit star is drawn in the accent colour, an unlit one is dim. */
  const lit = () =>
    stars().map((star) => {
      const glyph = star.children[0] as unknown as { props: { style: unknown } };
      return (StyleSheet.flatten(glyph.props.style as never) as { color?: string }).color === "#FF2A2A";
    });

  it("lights every star up to the rating, and none when there is none", async () => {
    list.mockResolvedValue([item({ rating: 3 })]);
    await renderDetail();
    await screen.findByText("3 out of 5");
    expect(lit()).toEqual([true, true, true, false, false]);
  });

  it("starts as not rated: five stars, a hint, and nothing to clear", async () => {
    await renderDetail();
    expect(await screen.findByText("YOUR RATING")).toBeTruthy();
    expect(stars()).toHaveLength(5);
    expect(screen.getByText("Not rated yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear rating" })).toBeNull();
    expect(stars().every((s) => s.props.accessibilityState.selected === false)).toBe(true);
    expect(lit()).toEqual([false, false, false, false, false]);
  });

  it("shows the rating you gave, and marks that star as the chosen one", async () => {
    list.mockResolvedValue([item({ rating: 4 })]);
    await renderDetail();
    expect(await screen.findByText("4 out of 5")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Rate 4 stars" }).props.accessibilityState).toMatchObject({ selected: true, checked: true });
    expect(screen.getByRole("radio", { name: "Rate 3 stars" }).props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText("Your rating. 4 out of 5.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear rating" })).toBeTruthy();
  });

  it("rates the title with the star tapped, and says so at once", async () => {
    serverKeepsRatings();
    await renderDetail();
    await fireEvent.press(await screen.findByRole("radio", { name: "Rate 3 stars" }));
    expect(update).toHaveBeenCalledWith(44, { rating: 3 });
    expect(await screen.findByText("3 out of 5")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Rate 3 stars" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("button", { name: "Clear rating" })).toBeTruthy();
  });

  it("changes the rating when another star is tapped", async () => {
    serverKeepsRatings(2);
    await renderDetail();
    expect(await screen.findByText("2 out of 5")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Rate 5 stars" }));
    expect(update).toHaveBeenLastCalledWith(44, { rating: 5 });
    expect(await screen.findByText("5 out of 5")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Rate 1 star" }));
    expect(update).toHaveBeenLastCalledWith(44, { rating: 1 });
    expect(await screen.findByText("1 out of 5")).toBeTruthy();
  });

  it("takes the rating back with Clear rating, by sending an explicit null", async () => {
    serverKeepsRatings(4);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear rating" }));
    expect(update).toHaveBeenCalledWith(44, { rating: null });
    expect(await screen.findByText("Not rated yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear rating" })).toBeNull();
  });

  it("can be rated again after it was cleared", async () => {
    serverKeepsRatings(4);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear rating" }));
    await screen.findByText("Not rated yet");
    await fireEvent.press(screen.getByRole("radio", { name: "Rate 2 stars" }));
    expect(await screen.findByText("2 out of 5")).toBeTruthy();
  });

  it("shows the new rating while it is still being saved, and puts the old one back if saving fails", async () => {
    let fail!: (e: Error) => void;
    list.mockResolvedValue([item({ rating: 4 })]);
    update.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("radio", { name: "Rate 2 stars" }));
    expect(await screen.findByText("2 out of 5")).toBeTruthy(); // before the server has answered
    expect(screen.queryByText("4 out of 5")).toBeNull();
    await act(async () => fail(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later.")));
    expect(await screen.findByText("4 out of 5")).toBeTruthy();
    expect(screen.queryByText("2 out of 5")).toBeNull();
  });

  it("shows the rating as cleared while that is still being saved, and brings it back if saving fails", async () => {
    let fail!: (e: Error) => void;
    list.mockResolvedValue([item({ rating: 3 })]);
    update.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear rating" }));
    expect(await screen.findByText("Not rated yet")).toBeTruthy();
    await act(async () => fail(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later.")));
    expect(await screen.findByText("3 out of 5")).toBeTruthy();
  });

  it("is put back, with the reason, when it cannot be saved", async () => {
    list.mockResolvedValue([item({ rating: 4 })]);
    update.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("radio", { name: "Rate 1 star" }));
    expect(await screen.findByText("Can't reach MangaPulse. Check your connection and try again later.")).toBeTruthy();
    expect(await screen.findByText("4 out of 5")).toBeTruthy(); // back to what it was
  });

  it("is put back even when the library cannot be read again afterwards (offline)", async () => {
    list.mockResolvedValueOnce([item({ rating: 4 })]).mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    update.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("radio", { name: "Rate 1 star" }));
    expect(await screen.findByText(/try again later/)).toBeTruthy();
    // nothing from the server can repair the screen now, so only putting it back can
    expect(await screen.findByText("4 out of 5")).toBeTruthy();
    expect(lit()).toEqual([true, true, true, true, false]);
  });

  it("is put back when taking it back cannot be saved", async () => {
    list.mockResolvedValue([item({ rating: 3 })]);
    update.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear rating" }));
    expect(await screen.findByText(/try again later/)).toBeTruthy();
    expect(await screen.findByText("3 out of 5")).toBeTruthy();
  });

  it("does not take new taps while one is being saved", async () => {
    let finish!: () => void;
    list.mockResolvedValue([item({ rating: null })]);
    update.mockReturnValue(new Promise((resolve) => (finish = () => resolve({}))));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("radio", { name: "Rate 3 stars" }));
    try {
      await waitFor(() => expect(screen.getByRole("radio", { name: "Rate 5 stars" }).props.accessibilityState.disabled).toBe(true));
      await fireEvent.press(screen.getByRole("radio", { name: "Rate 5 stars" }));
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => finish());
    }
  });

  it("never touches the other things on the page: only the rating is sent", async () => {
    serverKeepsRatings();
    await renderDetail();
    await fireEvent.press(await screen.findByRole("radio", { name: "Rate 4 stars" }));
    expect(update).toHaveBeenCalledWith(44, { rating: 4 });
    expect(Object.keys(update.mock.calls[0][1])).toEqual(["rating"]);
  });
});

describe("when the server cannot be reached", () => {
  it("shows the saved title instead of an error", async () => {
    list.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
    client.setQueryData(["tracked"], [item()]);
    await renderDetail(client);
    await waitFor(() => expect(list).toHaveBeenCalled()); // the refresh was tried and failed
    await waitFor(() => expect(client.getQueryState(["tracked"])?.status).toBe("error"));
    expect(screen.getByText("Naruto")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this title")).toBeNull();
  });

  it("still says so when there is nothing saved either", async () => {
    list.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderDetail();
    expect(await screen.findByText("Couldn't load this title")).toBeTruthy();
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
