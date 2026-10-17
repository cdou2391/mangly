import { useCallback } from "react";
import { router } from "expo-router";
import { openInBrowser } from "@/utils/browser";
import { useMarkChapterRead, type ChapterTarget } from "./useMarkChapterRead";

/** A chapter to open, from a row of the feed or a tapped notification; `unread` says whether opening it should also mark it read. */
export type OpenTarget = ChapterTarget & { unread: boolean };

/**
 * What tapping a chapter does, everywhere it appears: open the chapter, and if it was unread, record it as read
 * (which also settles its alerts). The chapter opens first, so reading never waits on the network. Without a link
 * there is nothing to read here, so go to the title (when it is in the library) and leave the progress alone.
 */
export function useOpenChapter() {
  const { mutate: markRead } = useMarkChapterRead();

  return useCallback(
    (c: OpenTarget) => {
      if (!c.chapter_url) {
        if (c.tracking_id !== null) router.push({ pathname: "/manga/[id]", params: { id: String(c.tracking_id) } });
        return;
      }
      void openInBrowser(c.chapter_url);
      if (c.unread) markRead(c);
    },
    [markRead],
  );
}
