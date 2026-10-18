import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recommendationsApi } from "@/api/endpoints";
import type { MoodRequest, MoodResult } from "@/api/types";

export const MOOD_RESULT_KEY = ["mood-result"];

/**
 * Picks by mood. Each request spends one of the reader's daily AI requests, so nothing is asked twice by accident:
 * there is no retry, and the last answer is kept for the session (in memory only: it is not part of the offline copy)
 * so leaving the screen and coming back does not lose what was paid for. Signing out clears it with everything else.
 */
export function useMoodPicks() {
  const qc = useQueryClient();

  // Holds the last answer; it is never fetched, only set by `ask`.
  const last = useQuery<MoodResult | null>({
    queryKey: MOOD_RESULT_KEY,
    queryFn: async () => qc.getQueryData<MoodResult>(MOOD_RESULT_KEY) ?? null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const ask = useMutation<MoodResult, Error, MoodRequest>({
    mutationFn: (request) => recommendationsApi.byMood(request),
    retry: false,
    onSuccess: (result) => qc.setQueryData(MOOD_RESULT_KEY, result),
  });

  return { result: ask.data ?? last.data ?? null, ask, last: last.data ?? null };
}
