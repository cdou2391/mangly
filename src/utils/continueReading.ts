import type { TrackedManga } from "@/api/types";
import { formatChapter, parseChapter, urlChapter } from "./chapters";
import { unreadOf } from "./library";

/**
 * The chapter link saved with a title's progress, unless it is plainly for another chapter than the one the reader says they
 * are on (a link left over from an earlier edit of the progress). Null when there is none to trust.
 */
export function savedChapterUrl(item: TrackedManga): string | null {
  const url = item.last_chapter_url;
  if (!url) return null;
  const linked = urlChapter(url);
  const read = parseChapter(item.last_chapter_read);
  return linked === null || read === null || linked === read ? url : null;
}

/** A title the reader is part-way through, and the chapter to read next. */
export interface ContinueCard {
  trackingId: number;
  title: string;
  coverUrl: string | null;
  /** The last chapter read, as a number. */
  read: number;
  /** The chapter after it. */
  next: number;
  /** How many chapters there are still to read, the next one included. */
  toGo: number;
  /** The page of the last chapter read, where the site's own "next" button leads on; null when there is no trustworthy link. */
  url: string | null;
}

/** The most titles offered to continue; the banner is a few cards, not the library. */
export const MAX_CONTINUE = 3;

/**
 * The titles to offer "continue reading" for: ones being read (status Reading), already started, with chapters still to read,
 * most recently touched first. There is no link to the next chapter (the site is only asked for the newest and the first), so
 * the card names the chapter and opens the page of the last one read. Titles not started, or caught up, are left out.
 */
export function continueCards(items: TrackedManga[], max = MAX_CONTINUE): ContinueCard[] {
  const cards: { card: ContinueCard; touched: number }[] = [];
  for (const item of items) {
    if (item.reading_status !== "reading") continue;
    const read = parseChapter(item.last_chapter_read);
    const behind = unreadOf(item);
    if (read === null || read <= 0 || behind === null || behind <= 0) continue;
    cards.push({
      card: {
        trackingId: item.id,
        title: item.manga.canonical_name,
        coverUrl: item.manga.cover_url,
        read,
        next: Math.floor(read) + 1,
        toGo: behind,
        url: savedChapterUrl(item),
      },
      touched: Date.parse(item.updated_at) || 0,
    });
  }
  return cards
    .sort((a, b) => b.touched - a.touched)
    .slice(0, max)
    .map((c) => c.card);
}

/** "Chapter 24 is next" and "22 chapters to go" for the lines on a card. */
export const nextLine = (c: ContinueCard) => `Next up: Ch. ${formatChapter(c.next)}`;
export const toGoLine = (c: ContinueCard) => `You're on Ch. ${formatChapter(c.read)} · ${c.toGo} ${c.toGo === 1 ? "chapter" : "chapters"} to go`;
