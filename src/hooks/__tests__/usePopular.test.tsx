import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import type { PopularManga, TrackedManga } from "@/api/types";
import { useFollowPopular } from "../usePopular";

jest.mock("@/api/endpoints", () => ({ trackingApi: { track: jest.fn() }, mangaApi: { popular: jest.fn() } }));

const track = trackingApi.track as jest.Mock;
const title = { id: 7, title: "Chainsaw Man", cover_url: null, author: null, status: null, genres: [], latest_chapter: null, readers: 2 } as PopularManga;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{children}</QueryClientProvider>
);

beforeEach(() => jest.clearAllMocks());

it("sends one request when the same title is tapped twice in the same instant", async () => {
  let finish!: () => void;
  track.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ id: 1 } as TrackedManga))));
  const { result } = await renderHook(() => useFollowPopular(), { wrapper });
  await act(async () => {
    void result.current.follow(title);
    void result.current.follow(title); // before any state update could disable the button
  });
  expect(track).toHaveBeenCalledTimes(1);
  expect(result.current.states[7]).toBe("adding");
  await act(async () => finish());
  expect(result.current.states[7]).toBeUndefined();
});

it("lets a title be followed again after a failure", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  track.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: 1 } as TrackedManga);
  const { result } = await renderHook(() => useFollowPopular(), { wrapper });
  await act(async () => result.current.follow(title));
  expect(result.current.states[7]).toBe("failed");
  await act(async () => result.current.follow(title));
  expect(track).toHaveBeenCalledTimes(2);
  expect(result.current.states[7]).toBeUndefined();
  warn.mockRestore();
});
