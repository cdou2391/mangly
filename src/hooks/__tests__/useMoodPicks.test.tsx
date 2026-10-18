import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { recommendationsApi } from "@/api/endpoints";
import type { MoodResult } from "@/api/types";
import { MOOD_RESULT_KEY, useMoodPicks } from "../useMoodPicks";

jest.mock("@/api/endpoints", () => ({ recommendationsApi: { byMood: jest.fn() } }));
const byMood = recommendationsApi.byMood as jest.Mock;

const answer = (mood = "happy"): MoodResult => ({ mood, mood_analysis: "x", recommendations: [], generated_by: "anthropic" });
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3, retryDelay: 0 } } }); // an app-wide retry must not reach this request
});

it("has nothing until the first request", async () => {
  const { result } = await renderHook(() => useMoodPicks(), { wrapper });
  expect(result.current.result).toBeNull();
  expect(byMood).not.toHaveBeenCalled();
});

it("asks with what it is given, and shows and keeps the answer", async () => {
  byMood.mockResolvedValue(answer());
  const { result } = await renderHook(() => useMoodPicks(), { wrapper });
  await act(async () => result.current.ask.mutate({ mood: "happy", context: "short" }));
  await waitFor(() => expect(result.current.result?.mood).toBe("happy"));
  expect(byMood).toHaveBeenCalledWith({ mood: "happy", context: "short" });
  expect(client.getQueryData(MOOD_RESULT_KEY)).toEqual(answer());
});

it("shows the kept answer to a screen that opens later, without asking again", async () => {
  client.setQueryData(MOOD_RESULT_KEY, answer("epic"));
  const { result } = await renderHook(() => useMoodPicks(), { wrapper });
  expect(result.current.result?.mood).toBe("epic");
  expect(result.current.last?.mood).toBe("epic");
  expect(byMood).not.toHaveBeenCalled();
});

it("does not retry a failed request: every try can cost one of the daily requests", async () => {
  byMood.mockRejectedValue(new ApiError(503, "down"));
  const { result } = await renderHook(() => useMoodPicks(), { wrapper });
  await act(async () => result.current.ask.mutate({ mood: "happy" }));
  await waitFor(() => expect(result.current.ask.isError).toBe(true));
  expect(byMood).toHaveBeenCalledTimes(1);
});

it("keeps the earlier answer when a later request fails", async () => {
  byMood.mockResolvedValueOnce(answer("happy")).mockRejectedValueOnce(new ApiError(429, "limit"));
  const { result } = await renderHook(() => useMoodPicks(), { wrapper });
  await act(async () => result.current.ask.mutate({ mood: "happy" }));
  await waitFor(() => expect(result.current.result?.mood).toBe("happy"));
  await act(async () => result.current.ask.mutate({ mood: "epic" }));
  await waitFor(() => expect(result.current.ask.isError).toBe(true));
  expect(result.current.result?.mood).toBe("happy");
});

it("keeps the newest answer", async () => {
  byMood.mockResolvedValueOnce(answer("happy")).mockResolvedValueOnce(answer("epic"));
  const { result } = await renderHook(() => useMoodPicks(), { wrapper });
  await act(async () => result.current.ask.mutate({ mood: "happy" }));
  await waitFor(() => expect(result.current.result?.mood).toBe("happy"));
  await act(async () => result.current.ask.mutate({ mood: "epic" }));
  await waitFor(() => expect(result.current.result?.mood).toBe("epic"));
  expect(client.getQueryData<MoodResult>(MOOD_RESULT_KEY)?.mood).toBe("epic");
});
