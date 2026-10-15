import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { trackingApi } from "@/api/endpoints";
import type { SearchCandidate, TrackedManga } from "@/api/types";
import { groupCandidates } from "@/utils/search";
import { useTrackTitle } from "../useTrackTitle";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("@/api/endpoints", () => ({ trackingApi: { fromSource: jest.fn() } }));

const fromSource = trackingApi.fromSource as jest.Mock;
const cand = (source: string): SearchCandidate => ({ title: "Dragon Ball", url: `https://${source}.test/db/`, cover_url: null, author: null, status: null, alternative_titles: [], source });
const [group] = groupCandidates([cand("mangaread"), cand("weebcentral")]);

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>{children}</QueryClientProvider>
);

beforeEach(() => jest.clearAllMocks());

it("sends one request when the same title is tapped twice in the same instant", async () => {
  let finish!: () => void;
  fromSource.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ id: 5 } as TrackedManga))));
  const { result } = await renderHook(() => useTrackTitle(), { wrapper });
  await act(async () => {
    void result.current.track(group, null);
    void result.current.track(group, null); // before any state update could disable the button
  });
  expect(fromSource).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(result.current.states[group.key]).toEqual({ phase: "added", trackingId: 5 });
});

it("lets the same title be tracked again after a failure", async () => {
  fromSource.mockRejectedValueOnce(new ApiError(0, "Network error. Check your connection.")).mockResolvedValue({ id: 5 } as TrackedManga);
  const { result } = await renderHook(() => useTrackTitle(), { wrapper });
  await act(async () => result.current.track(group, null));
  expect(result.current.states[group.key]).toEqual({ phase: "failed", message: "Network error. Check your connection." });
  await act(async () => result.current.track(group, null));
  expect(result.current.states[group.key]).toEqual({ phase: "added", trackingId: 5 });
});
