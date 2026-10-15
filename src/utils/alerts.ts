import { parseChapter } from "./chapters";

/**
 * Whether an unread alert is settled by reading a chapter: the same title, and a chapter at or before the one just
 * read (you cannot be on chapter 191 without having passed 189 and 190). Later chapters stay unread.
 * When either label has no number, only an identical label counts.
 */
export function alertCoveredByRead(
  alert: { manga_id: number; chapter_released: string },
  read: { manga_id: number; chapter: string },
): boolean {
  if (alert.manga_id !== read.manga_id) return false;
  const a = parseChapter(alert.chapter_released);
  const r = parseChapter(read.chapter);
  if (a === null || r === null) return alert.chapter_released.trim() === read.chapter.trim();
  return a <= r;
}
