import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { trackingApi } from "@/api/endpoints";
import type { HomePick, TrackedManga } from "@/api/types";
import { HOME_PICKS_KEY, useFollowPick } from "../useHomePicks";

jest.mock("@/api/endpoints", () => ({ trackingApi: { track: jest.fn() }, mangaApi: { homePicks: jest.fn() } }));

const track = trackingApi.track as jest.Mock;
const pick = (id: number): HomePick => ({ kind: "popular", id, title: `T${id}`, cover_url: null, author: null, status: null, genres: [], latest_chapter: null, because: null, reason: null, readers: 2 });

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(HOME_PICKS_KEY, [pick(7), pick(8)]);
});

it("sends one request when the same title is tapped twice in the same instant", async () => {
  let finish!: () => void;
  track.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ id: 1 } as TrackedManga))));
  const { result } = await renderHook(() => useFollowPick(), { wrapper });
  await act(async () => {
    void result.current.follow(pick(7));
    void result.current.follow(pick(7)); // before any state update could disable the button
  });
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith(7);
  expect(result.current.states[7]).toBe("adding");
  await act(async () => finish());
  expect(result.current.states[7]).toBeUndefined();
});

it("takes the followed title out of the picks, and asks again for the library and the picks", async () => {
  track.mockResolvedValue({ id: 1 } as TrackedManga);
  const refetch = jest.spyOn(client, "invalidateQueries");
  const { result } = await renderHook(() => useFollowPick(), { wrapper });
  await act(async () => result.current.follow(pick(7)));
  expect((client.getQueryData(HOME_PICKS_KEY) as HomePick[]).map((p) => p.id)).toEqual([8]);
  const keys = refetch.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
  expect(keys).toEqual(expect.arrayContaining(["tracked", "recent-chapters", "home-picks"]));
});

it("treats 'already followed' as done", async () => {
  track.mockRejectedValue(new ApiError(409, "Manga is already tracked."));
  const { result } = await renderHook(() => useFollowPick(), { wrapper });
  await act(async () => result.current.follow(pick(7)));
  expect((client.getQueryData(HOME_PICKS_KEY) as HomePick[]).map((p) => p.id)).toEqual([8]);
  expect(result.current.states[7]).toBeUndefined();
});

it("keeps the title, and lets it be followed again, after a failure", async () => {
  track.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: 1 } as TrackedManga);
  const { result } = await renderHook(() => useFollowPick(), { wrapper });
  await act(async () => result.current.follow(pick(7)));
  expect(result.current.states[7]).toBe("failed");
  expect((client.getQueryData(HOME_PICKS_KEY) as HomePick[]).map((p) => p.id)).toEqual([7, 8]);
  await act(async () => result.current.follow(pick(7)));
  expect(track).toHaveBeenCalledTimes(2);
  expect(result.current.states[7]).toBeUndefined();
});
