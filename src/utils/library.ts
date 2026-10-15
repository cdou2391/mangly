import type { ReadingStatus, TrackedManga } from "@/api/types";
import { unreadChapters } from "./chapters";

export type LibraryFilter = ReadingStatus | "all";

export const FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reading", label: "Reading" },
  { key: "plan_to_read", label: "Plan" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Done" },
  { key: "dropped", label: "Dropped" },
];

export const unreadOf = (item: TrackedManga): number | null =>
  unreadChapters(item.last_chapter_read, item.manga.latest_chapter);

export function countByFilter(items: TrackedManga[]): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = {
    all: items.length, reading: 0, plan_to_read: 0, on_hold: 0, completed: 0, dropped: 0,
  };
  for (const i of items) counts[i.reading_status] += 1;
  return counts;
}

const recency = (i: TrackedManga) =>
  Date.parse(i.preferred_source_record?.latest_chapter_at ?? i.manga.updated_at) || 0;

/** Titles you are behind on first, most recently updated first; then the rest, also most recent first. */
export function sortLibrary(items: TrackedManga[]): TrackedManga[] {
  return [...items].sort((a, b) => {
    const ua = (unreadOf(a) ?? 0) > 0 ? 1 : 0;
    const ub = (unreadOf(b) ?? 0) > 0 ? 1 : 0;
    return ub - ua || recency(b) - recency(a) || a.manga.canonical_name.localeCompare(b.manga.canonical_name);
  });
}
