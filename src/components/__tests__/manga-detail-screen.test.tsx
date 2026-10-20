import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { BROWSER_OPTIONS } from "@/utils/browser";
import MangaDetail from "@/app/manga/[id]";
import { trackingApi } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import type { TrackedManga } from "@/api/types";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn(), update: jest.fn(), remove: jest.fn() } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})), warmUpAsync: jest.fn(async () => ({})), mayInitWithUrlAsync: jest.fn(async () => ({})) }));

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

describe("getting the browser ready", () => {
  it("tells the browser about the latest chapter, which is the page most often opened from here", async () => {
    await renderDetail();
    await screen.findByText("Naruto");
    await waitFor(() => expect(WebBrowser.mayInitWithUrlAsync).toHaveBeenCalledWith("https://x.test/latest"));
    expect(WebBrowser.warmUpAsync).toHaveBeenCalled();
  });

  it("falls back to the title's own latest link when its site record has none", async () => {
    list.mockResolvedValue([item({ preferred_source_record: null })]);
    await renderDetail();
    await waitFor(() => expect(WebBrowser.mayInitWithUrlAsync).toHaveBeenCalledWith("https://x.test/700.5"));
  });

  it("still opens pages when the browser cannot be warmed up", async () => {
    (WebBrowser.warmUpAsync as jest.Mock).mockRejectedValueOnce(new Error("no Custom Tabs browser"));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read latest chapter" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/latest", BROWSER_OPTIONS);
  });
});

describe("reading from the start", () => {
  const FIRST = "https://x.test/naruto/chapter-1/";
  const withFirst = (first: string | null | undefined, record: Record<string, unknown> = {}, manga: Partial<TrackedManga["manga"]> = {}) => {
    const base = item({}, manga);
    list.mockResolvedValue([{ ...base, preferred_source_record: { ...base.preferred_source_record!, ...(first === undefined ? {} : { first_chapter: "Chapter 1", first_chapter_url: first }), ...record } }]);
  };

  it("offers the first chapter beside the latest one, and opens it", async () => {
    withFirst(FIRST);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read first chapter" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(FIRST, BROWSER_OPTIONS);
    expect(screen.getByRole("button", { name: "Read latest chapter" })).toBeTruthy();
  });

  it("does not touch your reading progress", async () => {
    withFirst(FIRST);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read first chapter" }));
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps opening the latest chapter from its own button", async () => {
    withFirst(FIRST);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read latest chapter" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/latest", BROWSER_OPTIONS);
  });

  it("shortens the two labels so they fit side by side, and keeps the full ones for a screen reader", async () => {
    withFirst(FIRST);
    await renderDetail();
    await screen.findByRole("button", { name: "Read first chapter" });
    expect(screen.getByText("First chapter")).toBeTruthy();
    expect(screen.getByText("Latest chapter")).toBeTruthy();
    expect(screen.queryByText("Read latest chapter")).toBeNull();
  });

  it("shows only the latest chapter, with its full label, until the server has the first chapter's link", async () => {
    withFirst(null);
    await renderDetail();
    expect(await screen.findByText("Read latest chapter")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read first chapter" })).toBeNull();
  });

  it("shows nothing extra for a title from a server that does not send it yet", async () => {
    withFirst(undefined);
    await renderDetail();
    await screen.findByText("Read latest chapter");
    expect(screen.queryByRole("button", { name: "Read first chapter" })).toBeNull();
  });

  it("shows nothing extra for a title with no source record", async () => {
    list.mockResolvedValue([item({ preferred_source_record: null })]);
    await renderDetail();
    await screen.findByText("Naruto");
    expect(screen.queryByRole("button", { name: "Read first chapter" })).toBeNull();
  });

  it.each(["javascript:alert(1)", "intent://x#Intent;end", "file:///etc/passwd", "mangly://x", "//x.test/a", ""])("never opens a link that is not a web address (%s)", async (bad) => {
    withFirst(bad);
    await renderDetail();
    await screen.findByText("Read latest chapter");
    expect(screen.queryByRole("button", { name: "Read first chapter" })).toBeNull();
  });

  it("is the one big button when there is no latest chapter link", async () => {
    withFirst(FIRST, { latest_chapter_url: null }, { latest_chapter_url: null });
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read first chapter" }));
    expect(screen.getByText("Read first chapter")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read latest chapter" })).toBeNull();
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(FIRST, BROWSER_OPTIONS);
  });
});

describe("reading", () => {
  it("opens the latest chapter", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Read latest chapter" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/latest", BROWSER_OPTIONS);
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

describe("setting the chapter by hand", () => {
  const field = () => screen.getByLabelText("Chapter you are up to");
  const save = () => screen.getByRole("button", { name: "Save progress" });
  const open = async () => {
    await renderDetail();
    await screen.findByText("I'M UP TO CHAPTER");
  };

  it("starts from the saved chapter, with nothing to save yet", async () => {
    await open();
    expect(field().props.value).toBe("698");
    expect(save().props.accessibilityState.disabled).toBe(true);
  });

  it("starts empty when you have not started, and the first step up is chapter 1", async () => {
    list.mockResolvedValue([item({ last_chapter_read: null })]);
    await open();
    expect(field().props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Next chapter" }));
    expect(field().props.value).toBe("1");
  });

  it("reads the chapter number out of a saved label", async () => {
    list.mockResolvedValue([item({ last_chapter_read: "Chapter 188.5" })]);
    await open();
    expect(field().props.value).toBe("188.5");
  });

  it("steps one chapter at a time, and not below 0", async () => {
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Next chapter" }));
    expect(field().props.value).toBe("699");
    await fireEvent.press(screen.getByRole("button", { name: "Previous chapter" }));
    await fireEvent.press(screen.getByRole("button", { name: "Previous chapter" }));
    expect(field().props.value).toBe("697");
    await fireEvent.changeText(field(), "0");
    expect(screen.getByRole("button", { name: "Previous chapter" }).props.accessibilityState?.disabled ?? screen.getByRole("button", { name: "Previous chapter" }).props.disabled).toBeTruthy();
  });

  it("saves the chapter typed, and only that", async () => {
    await open();
    await fireEvent.changeText(field(), "650");
    expect(save().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(save());
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(44, { last_chapter_read: "650" });
  });

  it("accepts a decimal chapter, with a comma too", async () => {
    await open();
    await fireEvent.changeText(field(), "650,5");
    await fireEvent.press(save());
    expect(update).toHaveBeenCalledWith(44, { last_chapter_read: "650.5" });
  });

  it("also saves the link to the chapter when you say you are on the latest one", async () => {
    await open();
    await fireEvent.changeText(field(), "700.5");
    await fireEvent.press(save());
    expect(update).toHaveBeenCalledWith(44, { last_chapter_read: "700.5", last_chapter_url: "https://x.test/700.5" });
  });

  it("drops anything that is not a number as it is typed", async () => {
    await open();
    await fireEvent.changeText(field(), "6a5-0");
    expect(field().props.value).toBe("650");
  });

  it("will not save something that is not a chapter number, and says so", async () => {
    await open();
    await fireEvent.changeText(field(), "6.5.1");
    expect(save().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Use a chapter number, like 188 or 188.5.")).toBeTruthy();
    await fireEvent.press(save());
    expect(update).not.toHaveBeenCalled();
  });

  it("will not save the chapter that is already saved", async () => {
    await open();
    await fireEvent.changeText(field(), "698.0");
    expect(save().props.accessibilityState.disabled).toBe(true);
  });

  it("shows the new chapter at once and fills the progress bar, then keeps it once saved", async () => {
    let saved = "698";
    list.mockImplementation(async () => [item({ last_chapter_read: saved })]);
    update.mockImplementation(async (_id: number, body: { last_chapter_read?: string }) => {
      if (body.last_chapter_read) saved = body.last_chapter_read;
      return {};
    });
    await open();
    await fireEvent.changeText(field(), "600");
    await fireEvent.press(save());
    expect(await screen.findByText("Ch. 600")).toBeTruthy();
    await waitFor(() => expect(save().props.accessibilityState.busy).toBe(false));
    expect(screen.getByText("Ch. 600")).toBeTruthy();
    expect(field().props.value).toBe("600");
  });

  it("puts the old chapter back, with the reason, when it cannot be saved", async () => {
    update.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await open();
    await fireEvent.changeText(field(), "600");
    await fireEvent.press(save());
    expect(await screen.findByText("Can't reach MangaPulse. Check your connection and try again later.")).toBeTruthy();
    expect(screen.getByText("Ch. 698")).toBeTruthy();
    expect(screen.queryByText("Ch. 600")).toBeNull();
    expect(field().props.value).toBe("600"); // what you typed stays, so you can try again
    expect(save().props.accessibilityState.disabled).toBe(false);
  });

  it("shows the new chapter while saving, and goes back to the old one if that fails", async () => {
    let fail!: () => void;
    update.mockReturnValue(new Promise((_, reject) => (fail = () => reject(new Error("Network error. Check your connection.")))));
    await open();
    await fireEvent.changeText(field(), "600");
    await fireEvent.press(save());
    expect(await screen.findByText("Ch. 600")).toBeTruthy();
    expect(screen.queryByText("Ch. 698")).toBeNull();
    await act(async () => fail());
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
    expect(screen.getByText("Ch. 698")).toBeTruthy();
    expect(field().props.value).toBe("600");
  });

  it("tries again with the same number after a failure", async () => {
    update.mockRejectedValueOnce(new Error("Network error. Check your connection."));
    await open();
    await fireEvent.changeText(field(), "600");
    await fireEvent.press(save());
    await screen.findByText("Network error. Check your connection.");
    await fireEvent.press(save());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith(44, { last_chapter_read: "600" });
  });

  it("shows the chapter as the server keeps it once saved, not as it was typed", async () => {
    let saved = "698";
    list.mockImplementation(async () => [item({ last_chapter_read: saved })]);
    update.mockImplementation(async (_id: number, body: { last_chapter_read?: string }) => {
      if (body.last_chapter_read) saved = body.last_chapter_read;
      return {};
    });
    await open();
    await fireEvent.changeText(field(), "650,5");
    await fireEvent.press(save());
    await waitFor(() => expect(field().props.value).toBe("650.5"));
  });

  it("puts the old chapter back even when the library cannot be read again afterwards (offline)", async () => {
    list.mockResolvedValueOnce([item()]).mockRejectedValue(new ApiError(0, "Can't reach MangaPulse."));
    update.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await open();
    await fireEvent.changeText(field(), "600");
    await fireEvent.press(save());
    expect(await screen.findByText("Can't reach MangaPulse. Check your connection and try again later.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Ch. 698")).toBeTruthy());
    expect(screen.queryByText("Ch. 600")).toBeNull();
  });

  it("goes back to following the saved chapter once marked as read from the button", async () => {
    let saved = "698";
    list.mockImplementation(async () => [item({ last_chapter_read: saved })]);
    update.mockImplementation(async (_id: number, body: { last_chapter_read?: string }) => {
      if (body.last_chapter_read) saved = body.last_chapter_read;
      return {};
    });
    await open();
    await fireEvent.changeText(field(), "650");
    await fireEvent.press(screen.getByRole("button", { name: "Mark Ch. 700.5 as read" }));
    await waitFor(() => expect(field().props.value).toBe("700.5"));
  });

  it("does not take a second save while one is going", async () => {
    let finish!: () => void;
    update.mockReturnValue(new Promise((resolve) => (finish = () => resolve({}))));
    await open();
    await fireEvent.changeText(field(), "600");
    await fireEvent.press(save());
    await waitFor(() => expect(save().props.accessibilityState.busy).toBe(true));
    await fireEvent.press(save());
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});

describe("going back to the chapter", () => {
  const LINK = "https://x.test/naruto/chapter-698/";

  it("continues reading from the chapter you last opened", async () => {
    list.mockResolvedValue([item({ last_chapter_url: LINK })]);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Continue reading" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(LINK, BROWSER_OPTIONS);
  });

  it("has nothing to continue from when no chapter was ever opened", async () => {
    await renderDetail();
    await screen.findByText("Naruto");
    expect(screen.queryByRole("button", { name: "Continue reading" })).toBeNull();
  });

  it("hides a saved link that is plainly for another chapter than the one you are on", async () => {
    list.mockResolvedValue([item({ last_chapter_read: "650", last_chapter_url: LINK })]);
    await renderDetail();
    await screen.findByText("Naruto");
    expect(screen.queryByRole("button", { name: "Continue reading" })).toBeNull();
  });

  it("keeps a link that does not say which chapter it is for", async () => {
    list.mockResolvedValue([item({ last_chapter_read: "650", last_chapter_url: "https://weeb.test/chapters/01HQ8ZXK3N" })]);
    await renderDetail();
    expect(await screen.findByRole("button", { name: "Continue reading" })).toBeTruthy();
  });

  it("opens the title on its site, without touching your progress", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("link", { name: "Open on MangaRead" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/naruto/", BROWSER_OPTIONS);
    expect(update).not.toHaveBeenCalled();
  });

  it("has no site to open when the title has none", async () => {
    list.mockResolvedValue([item({ preferred_source_record: null })]);
    await renderDetail();
    await screen.findByText("Naruto");
    expect(screen.queryByRole("link", { name: /^Open on/ })).toBeNull();
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
  const dialog = () => screen.queryByTestId("confirm-dialog");

  it("asks first, in the app's own dialog, saying which title and where the reader is, and does nothing if cancelled", async () => {
    await renderDetail();
    expect(dialog()).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    const card = within(screen.getByTestId("confirm-dialog"));
    expect(card.getByText("Remove from library?")).toBeTruthy();
    expect(card.getByText("Naruto")).toBeTruthy();
    expect(card.getByText(/You're on Ch\./)).toBeTruthy();
    expect(card.getByText(/your reading progress is deleted/)).toBeTruthy();
    await fireEvent.press(card.getByRole("button", { name: "Keep it" }));
    expect(dialog()).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("is also cancelled by a tap outside it or the Back button, never by a tap on the card", async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    await fireEvent.press(screen.getByTestId("confirm-dialog")); // the card swallows the tap
    expect(dialog()).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Dismiss: Remove from library?"));
    expect(dialog()).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Remove from library" }));
    type Node = { parent: Node | null; props: { onRequestClose?: () => void } };
    let node = screen.getByTestId("confirm-dialog") as unknown as Node | null;
    while (node && !node.props.onRequestClose) node = node.parent; // up to the Modal, which Android's Back button closes
    expect(node).not.toBeNull();
    await act(async () => node!.props.onRequestClose!());
    expect(dialog()).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes it and goes back once confirmed, without flashing 'not in your library'", async () => {
    list.mockResolvedValueOnce([item()]).mockResolvedValue([]);
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    await fireEvent.press(within(screen.getByTestId("confirm-dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => {}); // let the emptied library list render: the screen is still on show until the navigation happens
    expect(screen.queryByText("Not in your library")).toBeNull();
  });

  it("shows why removing failed and stays on the page, with the dialog closed", async () => {
    remove.mockRejectedValue(new Error("Network error. Check your connection."));
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove from library" }));
    await fireEvent.press(within(screen.getByTestId("confirm-dialog")).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
    expect(dialog()).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText("Naruto")).toBeTruthy();
  });
});
