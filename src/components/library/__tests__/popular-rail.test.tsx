import { Platform, ToastAndroid } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Library from "@/app/(tabs)/library";
import { ApiError } from "@/api/client";
import { mangaApi, notificationsApi, trackingApi } from "@/api/endpoints";
import type { PopularManga, TrackedManga } from "@/api/types";
import { PopularRail, popularSubtitle } from "../PopularRail";

jest.mock("@/api/endpoints", () => ({
  trackingApi: { list: jest.fn(), recentChapters: jest.fn(), update: jest.fn(), track: jest.fn() },
  notificationsApi: { list: jest.fn() },
  mangaApi: { popular: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const track = trackingApi.track as jest.Mock;
const popular = mangaApi.popular as jest.Mock;

const pop = (id: number, title: string, over: Partial<PopularManga> = {}): PopularManga => ({
  id, title, cover_url: null, author: null, status: null, genres: [], latest_chapter: null, readers: 1, ...over,
});
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
  list.mockResolvedValue([]);
  (trackingApi.recentChapters as jest.Mock).mockResolvedValue([]);
  (notificationsApi.list as jest.Mock).mockResolvedValue([]);
  popular.mockResolvedValue([pop(7, "Chainsaw Man", { readers: 4 }), pop(8, "Dandadan", { genres: ["Action"] }), pop(9, "Solo", { author: "Ada" })]);
  track.mockResolvedValue(mine(7));
});

describe("what is said under a title", () => {
  it("says how many readers when it is more than one, else what the title is", () => {
    expect(popularSubtitle(pop(1, "a", { readers: 4 }))).toBe("4 readers");
    expect(popularSubtitle(pop(1, "a", { readers: 1, genres: ["Action", "Drama"] }))).toBe("Action");
    expect(popularSubtitle(pop(1, "a", { readers: 1, author: "Ada" }))).toBe("Ada");
    expect(popularSubtitle(pop(1, "a", { readers: 1 }))).toBeNull();
  });
});

describe("the rail", () => {
  it("renders nothing without titles", async () => {
    const { toJSON } = await render(<PopularRail titles={[]} states={{}} onFollow={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("shows a Track button per title and reports the one tapped", async () => {
    const onFollow = jest.fn();
    await render(<PopularRail titles={[pop(7, "Chainsaw Man", { readers: 4 })]} states={{}} onFollow={onFollow} />);
    expect(screen.getByText("POPULAR ON MANGAPULSE")).toBeTruthy();
    expect(screen.getByText("4 readers")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Track Chainsaw Man" }));
    expect(onFollow).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("disables a card while it is being added, and offers a retry after a failure", async () => {
    const t = [pop(7, "Chainsaw Man")];
    const { rerender } = await render(<PopularRail titles={t} states={{ 7: "adding" }} onFollow={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Track Chainsaw Man" }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await rerender(<PopularRail titles={t} states={{ 7: "failed" }} onFollow={jest.fn()} />);
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});

describe("in the Library", () => {
  it("is offered to someone with an empty library, below the empty message", async () => {
    await renderLibrary();
    expect(await screen.findByText("POPULAR ON MANGAPULSE")).toBeTruthy();
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Track Dandadan" })).toBeTruthy();
    expect(popular).toHaveBeenCalledTimes(1);
  });

  it("is also offered while the library has only a title or two", async () => {
    list.mockResolvedValue([mine(1), mine(2)]);
    await renderLibrary();
    expect(await screen.findByText("POPULAR ON MANGAPULSE")).toBeTruthy();
  });

  it("is neither shown nor asked for once the library has three titles", async () => {
    list.mockResolvedValue([mine(1), mine(2), mine(3)]);
    await renderLibrary();
    await screen.findByText(/3 tracked/);
    expect(screen.queryByText("POPULAR ON MANGAPULSE")).toBeNull();
    expect(popular).not.toHaveBeenCalled();
  });

  it("is not asked for before the library is known", async () => {
    list.mockReturnValue(new Promise(() => {}));
    await renderLibrary();
    await act(async () => {});
    expect(popular).not.toHaveBeenCalled();
  });

  it("is simply absent when there is nothing to suggest", async () => {
    popular.mockResolvedValue([]);
    await renderLibrary();
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    await waitFor(() => expect(popular).toHaveBeenCalled());
    expect(screen.queryByText("POPULAR ON MANGAPULSE")).toBeNull();
  });

  it("is simply absent, with no error, when it cannot be loaded", async () => {
    popular.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderLibrary();
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    await waitFor(() => expect(popular).toHaveBeenCalled());
    expect(screen.queryByText("POPULAR ON MANGAPULSE")).toBeNull();
    expect(screen.queryByText(/Can't reach/)).toBeNull();
  });

  it("follows a title by its id, and the title leaves the rail and the library is refreshed", async () => {
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Track Chainsaw Man" }));
    expect(track).toHaveBeenCalledWith(7);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Track Chainsaw Man" })).toBeNull());
    expect(screen.getByRole("button", { name: "Track Dandadan" })).toBeTruthy();
    expect(list.mock.calls.length).toBeGreaterThan(1); // the library was asked again
  });

  it("treats 'already followed' as success", async () => {
    track.mockRejectedValue(new ApiError(409, "Manga is already tracked."));
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Track Dandadan" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Track Dandadan" })).toBeNull());
  });

  it("keeps the card, and says why, when it cannot be added", async () => {
    const original = Platform.OS;
    Platform.OS = "android";
    const toast = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    track.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderLibrary();
    await fireEvent.press(await screen.findByRole("button", { name: "Track Dandadan" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't add Dandadan. Can't reach MangaPulse. Check your connection and try again later.", ToastAndroid.LONG));
    expect(await screen.findByText("Try again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Track Dandadan" })).toBeTruthy();
    toast.mockRestore();
    Platform.OS = original;
  });
});
