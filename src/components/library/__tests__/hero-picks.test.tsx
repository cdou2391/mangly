import { Platform, ToastAndroid } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Library from "@/app/(tabs)/library";
import { ApiError } from "@/api/client";
import { mangaApi, notificationsApi, trackingApi } from "@/api/endpoints";
import type { HomePick, TrackedManga } from "@/api/types";
import { HeroPicks, pickLabel, pickSubtitle } from "../HeroPicks";

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
  it("renders nothing without picks", async () => {
    const { toJSON } = await render(<HeroPicks picks={[]} states={{}} onFollow={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("shows each pick with its label, why, genres and a Track button, and reports the one tapped", async () => {
    const onFollow = jest.fn();
    await render(<HeroPicks picks={[similar(7, "Berserk"), pick(8, "One Piece", { readers: 4 })]} states={{}} onFollow={onFollow} />);
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
    const { rerender } = await render(<HeroPicks picks={picks} states={{ 8: "adding" }} onFollow={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Track One Piece" }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await rerender(<HeroPicks picks={picks} states={{ 8: "failed" }} onFollow={jest.fn()} />);
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("has page dots only when there is more than one card", async () => {
    const { rerender } = await render(<HeroPicks picks={[pick(8, "One")]} states={{}} onFollow={jest.fn()} />);
    expect(screen.queryByTestId("hero-dots", { includeHiddenElements: true })).toBeNull();
    await rerender(<HeroPicks picks={[pick(8, "One"), pick(9, "Two")]} states={{}} onFollow={jest.fn()} />);
    expect(screen.getByTestId("hero-dots", { includeHiddenElements: true }).children).toHaveLength(2);
  });
});

describe("in the Library", () => {
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

  it("is simply absent when there is nothing to recommend", async () => {
    homePicks.mockResolvedValue([]);
    await renderLibrary();
    await screen.findByText(/1 tracked/);
    await waitFor(() => expect(homePicks).toHaveBeenCalled());
    expect(screen.queryByText("SIMILAR")).toBeNull();
    expect(screen.queryByText("POPULAR")).toBeNull();
  });

  it("is simply absent, with no error, when it cannot be loaded", async () => {
    homePicks.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderLibrary();
    await screen.findByText(/1 tracked/);
    await waitFor(() => expect(homePicks).toHaveBeenCalled());
    expect(screen.queryByText("SIMILAR")).toBeNull();
    expect(screen.queryByText(/Can't reach/)).toBeNull();
  });

  it("is simply absent while the server is not ordering yet (404 before it is deployed)", async () => {
    homePicks.mockRejectedValue(new ApiError(404, "Not Found"));
    await renderLibrary();
    await screen.findByText(/1 tracked/);
    expect(screen.queryByText("SIMILAR")).toBeNull();
    expect(screen.queryByText("Not Found")).toBeNull();
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
