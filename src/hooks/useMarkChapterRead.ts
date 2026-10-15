import { Platform, ToastAndroid } from "react-native";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import type { AppNotification, RecentChapter, TrackedManga } from "@/api/types";
import { alertCoveredByRead } from "@/utils/alerts";
import { chapterToStore, parseChapter } from "@/utils/chapters";
import type { FeedItem } from "@/utils/feed";

/** What is needed to record a chapter as read; every FeedItem has it. */
export type ChapterTarget = Pick<FeedItem, "manga_id" | "tracking_id" | "chapter" | "chapter_url" | "notification_id">;

/** The later of two "last chapter read" values, so reading an old chapter never moves progress backwards. */
function furthest(current: string | null, next: string): string {
  const c = parseChapter(current);
  const n = parseChapter(next);
  if (n === null) return current ?? next;
  return c === null || n > c ? next : (current as string);
}

/** True while `latest` is still past `read`. Labels without numbers can only be compared as text. */
function isPast(latest: string, read: string): boolean {
  const l = parseChapter(latest);
  const r = parseChapter(read);
  return l !== null && r !== null ? l > r : latest.trim() !== read.trim();
}

/**
 * Marks the alerts that reading this chapter settles as read, so the unread count clears. Best effort: the chapter
 * itself is already saved by now, so a failure here is logged and left for the next refresh to repair.
 */
async function clearSettledAlerts(qc: QueryClient, c: ChapterTarget): Promise<void> {
  try {
    const unread = await notificationsApi.list({ unreadOnly: true });
    const settled = unread.filter((n) => alertCoveredByRead(n, { manga_id: c.manga_id, chapter: c.chapter }));
    if (settled.length === 0) return;
    await Promise.allSettled(settled.map((n) => notificationsApi.markRead(n.id)));
  } catch (error) {
    console.warn("Could not clear the alerts for a chapter that was read", error);
  } finally {
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }
}

const failToast = (message: string) => {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.LONG);
};

type Snapshot = {
  tracked: TrackedManga[] | undefined;
  recent: RecentChapter[] | undefined;
  alerts: AppNotification[] | undefined;
};

async function snapshotAndCancel(qc: QueryClient): Promise<Snapshot> {
  await Promise.all(["tracked", "recent-chapters", "notifications"].map((k) => qc.cancelQueries({ queryKey: [k] })));
  return {
    tracked: qc.getQueryData<TrackedManga[]>(["tracked"]),
    recent: qc.getQueryData<RecentChapter[]>(["recent-chapters"]),
    alerts: qc.getQueryData<AppNotification[]>(["notifications"]),
  };
}

function restore(qc: QueryClient, s: Snapshot | undefined) {
  if (!s) return;
  qc.setQueryData(["tracked"], s.tracked);
  qc.setQueryData(["recent-chapters"], s.recent);
  qc.setQueryData(["notifications"], s.alerts);
}

/**
 * Records a chapter as read. The caches are updated first so the item and the Library catch up at once; if saving
 * fails they are put back and the user is told, so the screen never claims something that is not saved.
 *
 * A chapter backed by a notification is saved by marking that notification read, which the server turns into reading
 * progress itself (only ever forwards); any other chapter is saved as the title's progress directly.
 */
export function useMarkChapterRead() {
  const qc = useQueryClient();

  return useMutation<unknown, Error, ChapterTarget, Snapshot>({
    mutationFn: async (c) => {
      if (c.notification_id !== null) return notificationsApi.markRead(c.notification_id);
      if (c.tracking_id === null) throw new Error("This title is not in your library.");
      return trackingApi.update(c.tracking_id, { last_chapter_read: chapterToStore(c.chapter), last_chapter_url: c.chapter_url });
    },

    onMutate: async (c) => {
      const previous = await snapshotAndCancel(qc);
      const stored = chapterToStore(c.chapter);
      qc.setQueryData<TrackedManga[]>(["tracked"], (list) =>
        list?.map((t) => {
          if (t.manga_id !== c.manga_id) return t;
          const next = furthest(t.last_chapter_read, stored);
          return next === t.last_chapter_read ? t : { ...t, last_chapter_read: next, last_chapter_url: c.chapter_url ?? t.last_chapter_url };
        }),
      );
      qc.setQueryData<RecentChapter[]>(["recent-chapters"], (list) =>
        list?.map((r) => (r.manga_id === c.manga_id ? { ...r, is_new: isPast(r.chapter, c.chapter) } : r)),
      );
      qc.setQueryData<AppNotification[]>(["notifications"], (list) =>
        list?.map((n) => (!n.is_read && alertCoveredByRead(n, { manga_id: c.manga_id, chapter: c.chapter }) ? { ...n, is_read: true } : n)),
      );
      return previous;
    },

    // Only once the chapter is saved: never clear alerts for something that was not recorded as read.
    onSuccess: (_data, c) => {
      void clearSettledAlerts(qc, c);
    },

    onError: (_error, _chapter, previous) => {
      restore(qc, previous);
      failToast("Couldn't mark it as read. Check your connection.");
    },

    // Whatever happened, the server is the source of truth.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tracked"] });
      void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
    },
  });
}

/**
 * "Mark all read": every new chapter becomes read (the title's progress moves to its latest chapter) and every
 * alert is marked read. All or nothing as far as the screen is concerned: if anything fails, everything is put back.
 */
export function useMarkAllRead() {
  const qc = useQueryClient();

  return useMutation<void, Error, RecentChapter[], Snapshot>({
    mutationFn: async (fresh) => {
      const progress = await Promise.allSettled(
        fresh.map((c) => trackingApi.update(c.tracking_id, { last_chapter_read: chapterToStore(c.chapter), last_chapter_url: c.chapter_url })),
      );
      await notificationsApi.markAllRead();
      if (progress.some((p) => p.status === "rejected")) throw new Error("Some titles could not be updated.");
    },

    onMutate: async (fresh) => {
      const previous = await snapshotAndCancel(qc);
      const byManga = new Map(fresh.map((c) => [c.manga_id, c]));
      qc.setQueryData<TrackedManga[]>(["tracked"], (list) =>
        list?.map((t) => {
          const c = byManga.get(t.manga_id);
          return c ? { ...t, last_chapter_read: chapterToStore(c.chapter), last_chapter_url: c.chapter_url ?? t.last_chapter_url } : t;
        }),
      );
      qc.setQueryData<RecentChapter[]>(["recent-chapters"], (list) => list?.map((r) => ({ ...r, is_new: false })));
      qc.setQueryData<AppNotification[]>(["notifications"], (list) => list?.map((n) => ({ ...n, is_read: true })));
      return previous;
    },

    onError: (_error, _fresh, previous) => {
      restore(qc, previous);
      failToast("Couldn't mark everything as read. Check your connection.");
    },

    onSettled: () => {
      for (const k of ["tracked", "recent-chapters", "notifications"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
