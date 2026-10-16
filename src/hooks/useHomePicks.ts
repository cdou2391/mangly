import { useCallback, useRef, useState } from "react";
import { Platform, ToastAndroid } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { describeError } from "@/api/errors";
import { mangaApi, trackingApi } from "@/api/endpoints";
import type { HomePick } from "@/api/types";

export const HOME_PICKS_KEY = ["home-picks"];

/**
 * The recommendations for the top of the Library: titles like the reader's own, mixed with popular ones. It is a
 * suggestion, never a requirement: if it cannot be loaded (offline, server trouble) or there is nothing to suggest,
 * there is simply no hero and no error. Not kept for offline use.
 */
export function useHomePicks() {
  return useQuery({
    queryKey: HOME_PICKS_KEY,
    queryFn: () => mangaApi.homePicks(),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export type FollowState = "adding" | "failed";

/**
 * Follow a recommended title. Several can be followed one after another; a second tap while one is being added is
 * ignored. It leaves the hero as soon as it is followed. The server saying it is already followed (409) is what the user
 * wanted.
 */
export function useFollowPick() {
  const qc = useQueryClient();
  const [states, setStates] = useState<Record<number, FollowState>>({});
  const inFlight = useRef(new Set<number>());

  const follow = useCallback(
    async (pick: HomePick) => {
      if (inFlight.current.has(pick.id)) return;
      inFlight.current.add(pick.id);
      setStates((s) => ({ ...s, [pick.id]: "adding" }));
      let done = false;
      try {
        await trackingApi.track(pick.id);
        done = true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) done = true;
        else if (Platform.OS === "android") ToastAndroid.show(`Couldn't add ${pick.title}. ${describeError(e, "track")}`, ToastAndroid.LONG);
      } finally {
        inFlight.current.delete(pick.id);
        setStates((s) => {
          const { [pick.id]: _gone, ...rest } = s;
          return done ? rest : { ...rest, [pick.id]: "failed" };
        });
      }
      if (done) {
        qc.setQueryData<HomePick[]>(HOME_PICKS_KEY, (list) => list?.filter((p) => p.id !== pick.id));
        void qc.invalidateQueries({ queryKey: ["tracked"] });
        void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
        void qc.invalidateQueries({ queryKey: HOME_PICKS_KEY }); // the library changed, so what is similar to it has too
      }
    },
    [qc],
  );

  return { states, follow };
}
