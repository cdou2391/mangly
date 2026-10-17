import type { ReadingStatus, TrackedManga } from "@/api/types";
import { parseChapter } from "./chapters";
import { unreadOf } from "./library";

export const STATUS_ORDER: ReadingStatus[] = ["reading", "completed", "on_hold", "plan_to_read", "dropped"];
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_GENRES = 8;
const FURTHEST = 3;

export interface Counted {
  label: string;
  count: number;
}

export interface LibraryStats {
  titles: number;
  /** Chapters read, counted from the last chapter number saved in each title (a title with no number counts 0). */
  chaptersRead: number;
  /** Chapters you are behind on, over every title, and how many titles that is. */
  chaptersBehind: number;
  titlesBehind: number;
  rated: number;
  /** Mean of the ratings you gave, one decimal; null when nothing is rated. */
  averageRating: number | null;
  /** How many titles got each rating, 1 to 5. */
  ratings: Record<1 | 2 | 3 | 4 | 5, number>;
  byStatus: { status: ReadingStatus; count: number }[];
  genres: Counted[];
  sources: Counted[];
  addedLast30Days: number;
  furthestBehind: { id: number; title: string; behind: number }[];
}

const byCountThenName = (a: Counted, b: Counted) => b.count - a.count || a.label.localeCompare(b.label);

/** Everything the stats screen shows, worked out from the library already on the phone. */
export function computeStats(items: TrackedManga[], now: Date = new Date(), sourceLabel: (s: string) => string = (s) => s): LibraryStats {
  const ratings: LibraryStats["ratings"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const status = new Map<ReadingStatus, number>();
  const genres = new Map<string, Counted>();
  const sources = new Map<string, number>();
  let chaptersRead = 0;
  let chaptersBehind = 0;
  let titlesBehind = 0;
  let ratingSum = 0;
  let rated = 0;
  let addedLast30Days = 0;
  const behindList: LibraryStats["furthestBehind"] = [];

  for (const t of items) {
    const read = parseChapter(t.last_chapter_read);
    if (read !== null) chaptersRead += Math.floor(read);

    const behind = unreadOf(t) ?? 0;
    if (behind > 0) {
      chaptersBehind += behind;
      titlesBehind += 1;
      behindList.push({ id: t.id, title: t.manga.canonical_name, behind });
    }

    if (t.rating !== null && t.rating >= 1 && t.rating <= 5) {
      ratings[t.rating as 1 | 2 | 3 | 4 | 5] += 1;
      ratingSum += t.rating;
      rated += 1;
    }

    status.set(t.reading_status, (status.get(t.reading_status) ?? 0) + 1);

    const mine = new Map<string, string>(); // this title's genres by lower-case name, so one listed twice counts once
    for (const g of t.manga.genres ?? []) {
      const name = g.trim();
      if (name) mine.set(name.toLowerCase(), mine.get(name.toLowerCase()) ?? name);
    }
    for (const [key, raw] of mine) {
      const seen = genres.get(key);
      if (seen) seen.count += 1;
      else genres.set(key, { label: raw, count: 1 });
    }

    const source = t.preferred_source_record?.source ?? "";
    sources.set(source, (sources.get(source) ?? 0) + 1);

    const added = Date.parse(t.created_at);
    if (!Number.isNaN(added) && now.getTime() - added <= 30 * DAY_MS && added <= now.getTime() + DAY_MS) addedLast30Days += 1;
  }

  return {
    titles: items.length,
    chaptersRead,
    chaptersBehind,
    titlesBehind,
    rated,
    averageRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : null,
    ratings,
    byStatus: STATUS_ORDER.map((s) => ({ status: s, count: status.get(s) ?? 0 })).filter((s) => s.count > 0),
    genres: [...genres.values()].sort(byCountThenName).slice(0, TOP_GENRES),
    sources: [...sources.entries()]
      .map(([source, count]) => ({ label: source ? sourceLabel(source) : "Unknown", count }))
      .sort(byCountThenName),
    addedLast30Days,
    furthestBehind: behindList.sort((a, b) => b.behind - a.behind || a.title.localeCompare(b.title)).slice(0, FURTHEST),
  };
}
