import { useCallback, useRef, useState } from "react";
import { Platform, ToastAndroid } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { describeError } from "@/api/errors";
import { mangaApi, trackingApi } from "@/api/endpoints";
import type { PopularManga } from "@/api/types";

/** The rail is for people just starting out: it shows while the library has fewer titles than this. */
export const SPARSE_LIBRARY = 3;

/**
 * Titles other readers follow, for a library that is empty or nearly so. It is a suggestion, never a requirement: if
 * it cannot be loaded (offline, server trouble) or there is nothing to suggest, there is simply no rail. Not kept for
 * offline use.
 */
export function usePopular(enabled: boolean) {
  return useQuery({
    queryKey: ["popular"],
    queryFn: () => mangaApi.popular(),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export type FollowState = "adding" | "failed";

/**
 * Follow a suggested title. Several can be followed one after another; a second tap while one is being added is ignored.
 * It leaves the rail as soon as it is followed. The server saying it is already followed (409) is what the user wanted.
 */
export function useFollowPopular() {
  const qc = useQueryClient();
  const [states, setStates] = useState<Record<number, FollowState>>({});
  const inFlight = useRef(new Set<number>());

  const follow = useCallback(
    async (title: PopularManga) => {
      if (inFlight.current.has(title.id)) return;
      inFlight.current.add(title.id);
      setStates((s) => ({ ...s, [title.id]: "adding" }));
      let done = false;
      try {
        await trackingApi.track(title.id);
        done = true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) done = true;
        else if (Platform.OS === "android") ToastAndroid.show(`Couldn't add ${title.title}. ${describeError(e, "track")}`, ToastAndroid.LONG);
      } finally {
        inFlight.current.delete(title.id);
        setStates((s) => {
          const { [title.id]: _gone, ...rest } = s;
          return done ? rest : { ...rest, [title.id]: "failed" };
        });
      }
      if (done) {
        qc.setQueryData<PopularManga[]>(["popular"], (list) => list?.filter((p) => p.id !== title.id));
        void qc.invalidateQueries({ queryKey: ["tracked"] });
        void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
      }
    },
    [qc],
  );

  return { states, follow };
}
