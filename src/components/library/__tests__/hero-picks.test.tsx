import { Dimensions, Platform, StyleSheet, ToastAndroid } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Library from "@/app/(tabs)/library";
import { ApiError } from "@/api/client";
import { mangaApi, notificationsApi, trackingApi } from "@/api/endpoints";
import type { HomePick, TrackedManga } from "@/api/types";
import * as WebBrowser from "expo-web-browser";
import { HeroPicks, pickLabel, pickSubtitle } from "../HeroPicks";
import type { ContinueCard } from "@/utils/continueReading";

jest.mock("@/api/endpoints", () => ({
  trackingApi: { list: jest.fn(), recentChapters: jest.fn(), update: jest.fn(), track: jest.fn() },
  notificationsApi: { list: jest.fn() },
  mangaApi: { homePicks: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const track = trackingApi.track as jest.Mock;
const homePicks = mangaApi.homePicks as jest.Mock;

const pick = (id: number, title: string, over: Partial<HomePick> = {}): HomePick => ({
  kind: "popular", id, title, cover_url: null, author: null, status: null, genres: [], latest_chapter: null, because: null, reason: null, readers: 1, ...over,
});
const similar = (id: number, title: string, because = "Chainsaw Man", over: Partial<HomePick> = {}) => pick(id, title, { kind: "similar", because, reason: `Shares Action with ${because}`, readers: null, genres: ["Action"], ...over });

const NOW = "2026-10-14T12:00:00Z";
const mine = (id: number): TrackedManga =>
  ({
    id, user_id: 1, manga_id: id, preferred_source_record_id: null, last_chapter_read: "1", last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: null, created_at: NOW, updated_at: NOW, preferred_source_record: null,
    manga: { id, canonical_name: `Mine ${id}`, genres: null, author: null, summary: null, cover_url: null, latest_chapter: "1", latest_chapter_url: null, global_status: "ongoing", created_at: NOW, updated_at: NOW },
  }) as TrackedManga;

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderLibrary = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Library />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue([mine(1)]);
  (trackingApi.recentChapters as jest.Mock).mockResolvedValue([]);
  (notificationsApi.list as jest.Mock).mockResolvedValue([]);
  homePicks.mockResolvedValue([similar(7, "Berserk"), pick(8, "One Piece", { readers: 4 }), pick(9, "Solo", { genres: ["Drama"] })]);
  track.mockResolvedValue(mine(7));
});

describe("what a card says", () => {
  it("is labelled by where the pick comes from", () => {
    expect(pickLabel(similar(1, "a"))).toBe("SIMILAR");
    expect(pickLabel(pick(1, "a"))).toBe("POPULAR");
  });

  it("says what a similar pick resembles, and how many readers follow a popular one", () => {
    expect(pickSubtitle(similar(1, "a", "Naruto"))).toBe("Because you read Naruto");
    expect(pickSubtitle(similar(1, "a", "x", { because: null }))).toBeNull();
    expect(pickSubtitle(pick(1, "a", { readers: 4 }))).toBe("4 readers follow this");
    expect(pickSubtitle(pick(1, "a", { readers: 1, genres: ["Action"] }))).toBe("Action");
    expect(pickSubtitle(pick(1, "a", { readers: 1, author: "Ada" }))).toBe("Ada");
    expect(pickSubtitle(pick(1, "a", { readers: null }))).toBeNull();
  });
});

describe("the hero", () => {
  it("shows each pick with its label, why, genres and a Track button, and reports the one tapped", async () => {
    const onFollow = jest.fn();
    await render(<HeroPicks picks={[similar(7, "Berserk"), pick(8, "One Piece", { readers: 4 })]} settled states={{}} onFollow={onFollow} onSearch={jest.fn()} />);
    expect(screen.getByText("SIMILAR")).toBeTruthy();
    expect(screen.getByText("POPULAR")).toBeTruthy();
    expect(screen.getByText("Because you read Chainsaw Man")).toBeTruthy();
    expect(screen.getByText("4 readers follow this")).toBeTruthy();
    expect(screen.getByLabelText("Berserk. similar. Because you read Chainsaw Man")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Track Berserk" }));
    expect(onFollow).toHaveBeenCalledWith(expect.objectContaining({ id: 7, kind: "similar" }));
  });

  it("disables a card while it is being added, and offers a retry after a failure", async () => {
    const picks = [pick(8, "One Piece")];
    const { rerender } = await render(<HeroPicks picks={picks} settled states={{ 8: "adding" }} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Track One Piece" }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await rerender(<HeroPicks picks={picks} settled states={{ 8: "failed" }} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("has page dots only when there is more than one card", async () => {
    const { rerender } = await render(<HeroPicks picks={[pick(8, "One")]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.queryByTestId("hero-dots", { includeHiddenElements: true })).toBeNull();
    await rerender(<HeroPicks picks={[pick(8, "One"), pick(9, "Two")]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByTestId("hero-dots", { includeHiddenElements: true }).children).toHaveLength(2);
  });
});

describe("when there is nothing to recommend", () => {
  it("invites the reader to search, so the top of the Library is never blank", async () => {
    const onSearch = jest.fn();
    await render(<HeroPicks picks={[]} settled states={{}} onFollow={jest.fn()} onSearch={onSearch} />);
    expect(screen.getByText("Find your next read")).toBeTruthy();
    expect(screen.queryByText("SIMILAR")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Search for a manga" }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("shows nothing at all while the picks are still being asked for, so one banner is not swapped for another", async () => {
    const { toJSON } = await render(<HeroPicks picks={[]} settled={false} states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("is the same full-width banner, with no card around it", async () => {
    await render(<HeroPicks picks={[]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    const flat = StyleSheet.flatten(screen.getByLabelText(/^Find your next read/).props.style);
    expect(flat.borderRadius).toBeUndefined();
    expect(flat.marginHorizontal).toBeUndefined();
  });
});

describe("scrolling", () => {
  const scrollTo = (x: number) => fireEvent.scroll(screen.getByTestId("hero-list"), { nativeEvent: { contentOffset: { x, y: 0 } } });
  const activeDot = () =>
    screen.getByTestId("hero-dots", { includeHiddenElements: true }).children.findIndex((c) => JSON.stringify((c as unknown as { props: { style: unknown } }).props.style).includes("18"));

  it("is a horizontal pager, one screen per title, that Android can hand the gesture to", async () => {
    await render(<HeroPicks picks={[pick(8, "One"), pick(9, "Two")]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    const list = screen.getByTestId("hero-list");
    expect(list.props.horizontal).toBe(true);
    expect(list.props.pagingEnabled).toBe(true);
    expect(list.props.nestedScrollEnabled).toBe(true); // it is inside the vertical list; Android needs this to hand it the gesture
    expect(list.props.snapToInterval).toBeUndefined(); // plain paging, no snapping arithmetic to get wrong
  });

  it("makes every page as wide as the screen, with no side margin, and puts the title inside it", async () => {
    await render(<HeroPicks picks={[pick(8, "One"), pick(9, "Two")]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    const page = screen.getByLabelText(/^One\./);
    const flat = StyleSheet.flatten(page.props.style);
    expect(flat.width).toBe(Dimensions.get("window").width);
    expect(flat.borderRadius).toBeUndefined();
    expect(flat.margin).toBeUndefined();
    expect(flat.marginHorizontal).toBeUndefined();
    expect(within(page).getByText("One")).toBeTruthy(); // the title is inside the page, not under it
  });

  it("moves the page dot with the scroll position, however far a swipe went", async () => {
    await render(<HeroPicks picks={[pick(1, "A"), pick(2, "B"), pick(3, "C")]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(activeDot()).toBe(0);
    const step = Dimensions.get("window").width;
    await scrollTo(step);
    expect(activeDot()).toBe(1);
    await scrollTo(step * 2 + 4);
    expect(activeDot()).toBe(2);
    await scrollTo(step * 9); // overscroll never points past the last card
    expect(activeDot()).toBe(2);
    await scrollTo(-40);
    expect(activeDot()).toBe(0);
  });
});

describe("in the Library", () => {
  it("does not let Android detach views of the list, which can leave the hero missing when the content above changes", async () => {
    const original = Platform.OS;
    Platform.OS = "android"; // where a list detaches clipped views unless told not to
    await renderLibrary();
    await screen.findByText("Berserk");
    expect(screen.getByTestId("library-list").props.removeClippedSubviews).toBe(false);
    Platform.OS = original;
  });

  it("is at the top for everyone, with the new-chapters section under it", async () => {
    (trackingApi.recentChapters as jest.Mock).mockResolvedValue([
      { tracking_id: 1, manga_id: 1, manga_title: "Mine 1", manga_cover_url: null, chapter: "2", chapter_url: null, chapter_at: NOW, source: "mangaread", is_new: true },
    ]);
    await renderLibrary();
    expect(await screen.findByText("Berserk")).toBeTruthy();
    expect(screen.getByText("SIMILAR")).toBeTruthy();
    await screen.findByText("NEW FOR YOU");
    // in the order they are on screen
    const order = screen.getAllByText(/^(SIMILAR|NEW FOR YOU)$/).map((n) => n.props.children);
    expect(order).toEqual(["SIMILAR", "NEW FOR YOU"]);
  });

  it("is shown above the empty message for a new reader, who gets popular titles", async () => {
    list.mockResolvedValue([]);
    homePicks.mockResolvedValue([pick(8, "One Piece", { readers: 4 })]);
    await renderLibrary();
    expect(await screen.findByText("POPULAR")).toBeTruthy();
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
  });

  it("is also shown to an established reader", async () => {
    list.mockResolvedValue([mine(1), mine(2), mine(3), mine(4)]);
    await renderLibrary();
    expect(await screen.findByText("Berserk")).toBeTruthy();
  });

  it("shows the invitation to search when there is nothing to recommend", async () => {
    homePicks.mockResolvedValue([]);
    await renderLibrary();
    expect(await screen.findByText("Find your next read")).toBeTruthy();
    expect(screen.queryByText("SIMILAR")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Search for a manga" }));
    expect(router.navigate).toHaveBeenCalledWith("/search");
  });

  it("shows the invitation, with no error message, when the picks cannot be loaded and none were saved", async () => {
    homePicks.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderLibrary();
    expect(await screen.findByText("Find your next read")).toBeTruthy();
    expect(screen.queryByText(/Can't reach/)).toBeNull();
  });

  it("shows the invitation while the server does not have the endpoint yet (404)", async () => {
    homePicks.mockRejectedValue(new ApiError(404, "Not Found"));
    await renderLibrary();
    expect(await screen.findByText("Find your next read")).toBeTruthy();
    expect(screen.queryByText("Not Found")).toBeNull();
  });

  it("shows neither the hero nor the invitation while the picks are still loading", async () => {
    homePicks.mockReturnValue(new Promise(() => {}));
    await renderLibrary();
    await screen.findByText(/1 tracked/);
    expect(screen.queryByText("Find your next read")).toBeNull();
    expect(screen.queryByText("SIMILAR")).toBeNull();
  });

  it("keeps showing the last picks, not the invitation, when a refresh cannot reach the server", async () => {
    homePicks.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    client.setQueryData(["home-picks"], [similar(7, "Berserk")], { updatedAt: 0 }); // what the offline copy brings back: old, so it is asked for again
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={metrics}>
          <Library />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.getQueryState(["home-picks"])?.status).toBe("error"));
    await act(async () => {}); // let the screen react to the failed refresh
    expect(screen.getByText("Berserk")).toBeTruthy();
    expect(screen.queryByText("Find your next read")).toBeNull();
  });

  it("never shows the invitation next to real picks", async () => {
    await renderLibrary();
    await screen.findByText("Berserk");
    expect(screen.queryByText("Find your next read")).toBeNull();
  });

  it("follows a pick by its id; it leaves the hero and the library is asked again", async () => {
    // the server stops offering what has been followed
    homePicks.mockResolvedValueOnce([similar(7, "Berserk"), pick(8, "One Piece", { readers: 4 })]).mockResolvedValue([pick(8, "One Piece", { readers: 4 })]);
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Track Berserk" }));
    expect(track).toHaveBeenCalledWith(7);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Track Berserk" })).toBeNull());
    expect(screen.getByRole("button", { name: "Track One Piece" })).toBeTruthy();
    expect(list.mock.calls.length).toBeGreaterThan(1);
  });

  it("keeps the card, and says why, when it cannot be added", async () => {
    const original = Platform.OS;
    Platform.OS = "android";
    const toast = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    track.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Track One Piece" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't add One Piece. Can't reach MangaPulse. Check your connection and try again later.", ToastAndroid.LONG));
    expect(await screen.findByText("Try again")).toBeTruthy();
    toast.mockRestore();
    Platform.OS = original;
  });

  it("is asked for again on pull to refresh", async () => {
    await renderLibrary();
    await screen.findByText("Berserk");
    homePicks.mockClear();
    await act(async () => screen.getByTestId("library-list").props.refreshControl.props.onRefresh());
    expect(homePicks).toHaveBeenCalledTimes(1);
  });
});

describe("continue reading", () => {
  const card = (id: number, over: Partial<ContinueCard> = {}): ContinueCard => ({ trackingId: id, title: `Reading ${id}`, coverUrl: null, read: 23, next: 24, toGo: 22, url: "https://x.test/m/chapter-23/", ...over });

  it("shows the title being read with the chapter to read next, before the recommendations", async () => {
    const onResume = jest.fn();
    await render(<HeroPicks picks={[pick(8, "One Piece")]} resume={[card(1)]} onResume={onResume} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByText("CONTINUE")).toBeTruthy();
    expect(screen.getByText("Next up: Ch. 24")).toBeTruthy();
    expect(screen.getByText("You're on Ch. 23 · 22 chapters to go")).toBeTruthy();
    const order = screen.getAllByText(/^(CONTINUE|POPULAR)$/).map((n) => n.props.children);
    expect(order).toEqual(["CONTINUE", "POPULAR"]);
    await fireEvent.press(screen.getByRole("button", { name: "Continue Reading 1" }));
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ trackingId: 1 }));
  });

  it("counts them in the dots and the scroll limit", async () => {
    await render(<HeroPicks picks={[pick(8, "One")]} resume={[card(1), card(2)]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByTestId("hero-dots", { includeHiddenElements: true }).children).toHaveLength(3);
  });

  it("is shown on its own when there is nothing to recommend, with no invitation to search", async () => {
    await render(<HeroPicks picks={[]} resume={[card(1)]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByText("CONTINUE")).toBeTruthy();
    expect(screen.queryByText("Find your next read")).toBeNull();
  });

  it("says Open, not Continue, when it has no chapter page to open", async () => {
    await render(<HeroPicks picks={[]} resume={[card(1, { url: null })]} settled states={{}} onFollow={jest.fn()} onSearch={jest.fn()} />);
    expect(screen.getByText("Open")).toBeTruthy();
  });

  describe("in the Library", () => {
    const reading = (id: number, over: Partial<TrackedManga> = {}) => ({ ...mine(id), last_chapter_read: "23", manga: { ...mine(id).manga, latest_chapter: "45" }, ...over });

    it("opens the page of the last chapter read, and leaves the progress alone", async () => {
      list.mockResolvedValue([reading(1, { last_chapter_url: "https://x.test/m/chapter-23/" })]);
      await renderLibrary();
      await fireEvent.press(await screen.findByRole("button", { name: "Continue Mine 1" }));
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://x.test/m/chapter-23/", expect.anything());
      expect(trackingApi.update).not.toHaveBeenCalled();
    });

    it("opens the title when there is no link to open", async () => {
      list.mockResolvedValue([reading(1)]);
      await renderLibrary();
      await fireEvent.press(await screen.findByRole("button", { name: "Continue Mine 1" }));
      expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "1" } });
    });

    it("offers nothing to continue when the reader is caught up", async () => {
      await renderLibrary(); // mine(): read 1 of 1
      await screen.findByText("Berserk");
      expect(screen.queryByText("CONTINUE")).toBeNull();
    });
  });
});
