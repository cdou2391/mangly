import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { describeError } from "@/api/errors";
import { trackingApi } from "@/api/endpoints";
import { candidatesFor, type TitleGroup } from "@/utils/search";

export type TrackState =
  | { phase: "adding" }
  | { phase: "added"; trackingId: number | null }
  | { phase: "failed"; message: string };

/**
 * Adds a searched title to the library. Several titles can be added at once, and a second tap while one is adding is
 * ignored. Sites are tried in turn when one is down (502); the server saying the title is already tracked (409) counts
 * as success, since that is what the user wanted.
 */
export function useTrackTitle() {
  const qc = useQueryClient();
  const [states, setStates] = useState<Record<string, TrackState>>({});
  const inFlight = useRef(new Set<string>());

  const track = useCallback(
    async (group: TitleGroup, preferredSource: string | null) => {
      if (inFlight.current.has(group.key)) return;
      inFlight.current.add(group.key);
      const set = (s: TrackState) => setStates((prev) => ({ ...prev, [group.key]: s }));
      set({ phase: "adding" });

      let failure: unknown = null;
      try {
        for (const c of candidatesFor(group, preferredSource)) {
          try {
            const tracked = await trackingApi.fromSource({ url: c.url, source: c.source });
            set({ phase: "added", trackingId: tracked.id });
            return;
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
              set({ phase: "added", trackingId: null }); // already in the library
              return;
            }
            failure = e;
            if (!(e instanceof ApiError && e.status === 502)) break; // only a site being down is worth trying the next site for
          }
        }
        set({ phase: "failed", message: describeError(failure, "track") });
      } finally {
        inFlight.current.delete(group.key);
        void qc.invalidateQueries({ queryKey: ["tracked"] });
        void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
      }
    },
    [qc],
  );

  return { states, track };
}
