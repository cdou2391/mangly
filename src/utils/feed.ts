import type { AppNotification, RecentChapter, TrackedManga } from "@/api/types";
import { parseChapter } from "./chapters";

/**
 * One line of the Updates feed: a chapter that came out for a title you track. It is built from two server lists that
 * describe the same releases differently:
 *  - notifications: one per chapter, kept as history, with a read flag (only for titles with notifications on);
 *  - recent chapters: the single latest chapter of each tracked title, "new" when it is past your reading progress.
 */
export interface FeedItem {
  key: string;
  manga_id: number;
  /** The title's tracking row, which the detail screen and progress updates use. Null when it cannot be found. */
  tracking_id: number | null;
  title: string;
  cover_url: string | null;
  chapter: string;
  chapter_url: string | null;
  source: string;
  /** When it came out (or, for an alert, when we found out). */
  at: string | null;
  unread: boolean;
  /** Set when the item is backed by a notification; reading it marks that notification read. */
  notification_id: number | null;
}

const chapterKey = (mangaId: number, label: string) => {
  const n = parseChapter(label);
  return `${mangaId}:${n ?? label.trim().toLowerCase()}`;
};

/** A recent chapter as a feed item, for screens that have one but not the notification behind it. */
export function fromRecent(c: RecentChapter): FeedItem {
  return {
    key: `chapter:${chapterKey(c.manga_id, c.chapter)}`,
    manga_id: c.manga_id,
    tracking_id: c.tracking_id,
    title: c.manga_title,
    cover_url: c.manga_cover_url,
    chapter: c.chapter,
    chapter_url: c.chapter_url,
    source: c.source,
    at: c.chapter_at,
    unread: c.is_new,
    notification_id: null,
  };
}

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

/**
 * Merges notifications and recent chapters into one list, newest first.
 *  - A chapter that has a notification appears once, as that notification; the rest of the latest chapters follow.
 *  - A notification counts as unread only while you have not read past it: if the title's progress already covers
 *    the chapter, the alert is stale and is shown as read, so this list never disagrees with the Library.
 *  - Notifications for titles you no longer track are dropped (when the tracked list is known).
 */
export function buildFeed(
  notifications: AppNotification[] | undefined,
  recent: RecentChapter[] | undefined,
  tracked: TrackedManga[] | undefined,
): FeedItem[] {
  const trackingByManga = new Map<number, number>();
  tracked?.forEach((t) => trackingByManga.set(t.manga_id, t.id));
  recent?.forEach((r) => trackingByManga.set(r.manga_id, r.tracking_id));
  const recentByManga = new Map<number, RecentChapter>();
  recent?.forEach((r) => recentByManga.set(r.manga_id, r));

  const items: FeedItem[] = [];
  const covered = new Set<string>();

  for (const n of notifications ?? []) {
    if (tracked && !trackingByManga.has(n.manga_id)) continue;
    const latest = recentByManga.get(n.manga_id);
    const num = parseChapter(n.chapter_released);
    const latestNum = latest ? parseChapter(latest.chapter) : null;
    const settledByProgress = !!latest && !latest.is_new && num !== null && latestNum !== null && num <= latestNum;
    const key = chapterKey(n.manga_id, n.chapter_released);
    covered.add(key);
    items.push({
      key: `chapter:${key}`,
      manga_id: n.manga_id,
      tracking_id: trackingByManga.get(n.manga_id) ?? null,
      title: n.manga.canonical_name,
      cover_url: n.manga.cover_url,
      chapter: n.chapter_released,
      chapter_url: n.latest_chapter_url,
      source: n.source,
      at: n.created_at,
      unread: !n.is_read && !settledByProgress,
      notification_id: n.id,
    });
  }

  for (const r of recent ?? []) {
    if (covered.has(chapterKey(r.manga_id, r.chapter))) continue;
    items.push(fromRecent(r));
  }

  return items.sort((a, b) => time(b.at) - time(a.at));
}

export type DayGroup = "today" | "yesterday" | "week" | "earlier";
export const GROUP_TITLES: Record<DayGroup, string> = {
  today: "TODAY",
  yesterday: "YESTERDAY",
  week: "EARLIER THIS WEEK",
  earlier: "EARLIER",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

function groupOf(at: string | null, now: Date): DayGroup {
  const t = time(at);
  if (t === -Infinity) return "earlier";
  const today = startOfDay(now);
  if (t >= today) return "today";
  if (t >= today - DAY) return "yesterday";
  if (t >= today - 6 * DAY) return "week";
  return "earlier";
}

/** Splits a newest-first list into Today / Yesterday / Earlier this week / Earlier, leaving out empty groups. */
export function groupByDay(items: FeedItem[], now: Date = new Date()): { group: DayGroup; title: string; data: FeedItem[] }[] {
  const buckets: Record<DayGroup, FeedItem[]> = { today: [], yesterday: [], week: [], earlier: [] };
  for (const i of items) buckets[groupOf(i.at, now)].push(i);
  return (Object.keys(buckets) as DayGroup[])
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ group: g, title: GROUP_TITLES[g], data: buckets[g] }));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Just now", "45m ago", "5h ago", "Yesterday", "Mon", "Oct 3"; empty when the time is unknown. */
export function formatWhen(at: string | null, now: Date = new Date()): string {
  const t = time(at);
  if (t === -Infinity) return "";
  const d = new Date(t);
  const group = groupOf(at, now);
  if (group === "today") {
    const mins = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }
  if (group === "yesterday") return "Yesterday";
  if (group === "week") return WEEKDAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
