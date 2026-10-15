import { Platform, ToastAndroid } from "react-native";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import type { RecentChapter, TrackedManga } from "@/api/types";
import { alertCoveredByRead } from "@/utils/alerts";
import { chapterToStore } from "@/utils/chapters";

/**
 * Marks the alerts that reading this chapter settles as read, so the Alerts badge clears. Best effort: the chapter
 * itself is already saved by now, so a failure here is logged and left for the next refresh to repair.
 */
async function clearSettledAlerts(qc: QueryClient, c: RecentChapter): Promise<void> {
  try {
    const unread = await notificationsApi.list({ unreadOnly: true });
    const settled = unread.filter((n) => alertCoveredByRead(n, { manga_id: c.manga_id, chapter: c.chapter }));
    if (settled.length === 0) return;

    const results = await Promise.allSettled(settled.map((n) => notificationsApi.markRead(n.id)));
    const cleared = results.filter((r) => r.status === "fulfilled").length;
    if (cleared > 0) {
      qc.setQueryData<{ count: number }>(["notifications", "unread"], (old) =>
        old ? { count: Math.max(0, old.count - cleared) } : old,
      );
    }
  } catch (error) {
    console.warn("Could not clear the alerts for a chapter that was read", error);
  } finally {
    void qc.invalidateQueries({ queryKey: ["notifications"] }); // also covers the unread count
  }
}

/**
 * Records a chapter as read. The caches are updated first so the card leaves "NEW FOR YOU" and the row catches up
 * at once; if saving fails they are put back and the user is told, so the screen never claims something that is not saved.
 */
export function useMarkChapterRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (c: RecentChapter) =>
      trackingApi.update(c.tracking_id, {
        last_chapter_read: chapterToStore(c.chapter),
        last_chapter_url: c.chapter_url,
      }),

    onMutate: async (c) => {
      await Promise.all([qc.cancelQueries({ queryKey: ["tracked"] }), qc.cancelQueries({ queryKey: ["recent-chapters"] })]);
      const previous = {
        tracked: qc.getQueryData<TrackedManga[]>(["tracked"]),
        recent: qc.getQueryData<RecentChapter[]>(["recent-chapters"]),
      };
      qc.setQueryData<TrackedManga[]>(["tracked"], (list) =>
        list?.map((t) =>
          t.id === c.tracking_id
            ? { ...t, last_chapter_read: chapterToStore(c.chapter), last_chapter_url: c.chapter_url ?? t.last_chapter_url }
            : t,
        ),
      );
      qc.setQueryData<RecentChapter[]>(["recent-chapters"], (list) =>
        list?.map((r) => (r.tracking_id === c.tracking_id ? { ...r, is_new: false } : r)),
      );
      return previous;
    },

    // Only once the chapter is saved: never clear alerts for something that was not recorded as read.
    onSuccess: (_data, c) => {
      void clearSettledAlerts(qc, c);
    },

    onError: (_error, _chapter, previous) => {
      if (previous) {
        qc.setQueryData(["tracked"], previous.tracked);
        qc.setQueryData(["recent-chapters"], previous.recent);
      }
      if (Platform.OS === "android") {
        ToastAndroid.show("Couldn't mark it as read. Check your connection.", ToastAndroid.LONG);
      }
    },

    // Whatever happened, the server is the source of truth.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tracked"] });
      void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
    },
  });
}
