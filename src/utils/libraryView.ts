import type { TrackedManga } from "@/api/types";
import { unreadOf, sortLibrary, type LibraryFilter } from "./library";

/** How many titles a page of the Library shows. */
export const PAGE_SIZE = 10;

export type SortKey = "behind" | "updated" | "added" | "az" | "za" | "rating";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "behind", label: "Most unread first" },
  { key: "updated", label: "Recently updated" },
  { key: "added", label: "Recently added" },
  { key: "az", label: "Title A to Z" },
  { key: "za", label: "Title Z to A" },
  { key: "rating", label: "Highest rated" },
];
export const DEFAULT_SORT: SortKey = "behind";
export const isSortKey = (v: unknown): v is SortKey => SORTS.some((s) => s.key === v);

/** What narrows the Library down. Status and "unread only" combine; a search narrows it further. */
export interface LibraryView {
  query: string;
  status: LibraryFilter;
  unreadOnly: boolean;
  sort: SortKey;
}
export const DEFAULT_VIEW: LibraryView = { query: "", status: "all", unreadOnly: false, sort: DEFAULT_SORT };

/** Lower case with accents removed, so "Pokemon" finds "Pokémon". */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const terms = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

/** A title matches when every word typed is somewhere in its title, author or the title the source site gives it. */
export function matchesQuery(item: TrackedManga, query: string): boolean {
  const words = terms(query);
  if (words.length === 0) return true;
  const haystack = normalize([item.manga.canonical_name, item.manga.author, item.preferred_source_record?.source_title].filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
}

const byTitle = (a: TrackedManga, b: TrackedManga) => normalize(a.manga.canonical_name).localeCompare(normalize(b.manga.canonical_name));
const time = (iso: string | null | undefined) => Date.parse(iso ?? "") || 0;
const updatedAt = (i: TrackedManga) => time(i.preferred_source_record?.latest_chapter_at ?? i.manga.updated_at);

export function sortItems(items: TrackedManga[], sort: SortKey): TrackedManga[] {
  switch (sort) {
    case "behind":
      return sortLibrary(items);
    case "updated":
      return [...items].sort((a, b) => updatedAt(b) - updatedAt(a) || byTitle(a, b));
    case "added":
      return [...items].sort((a, b) => time(b.created_at) - time(a.created_at) || byTitle(a, b));
    case "az":
      return [...items].sort(byTitle);
    case "za":
      return [...items].sort((a, b) => byTitle(b, a));
    case "rating":
      return [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b));
  }
}

/** Titles that have chapters you have not read. */
export const hasUnread = (i: TrackedManga) => (unreadOf(i) ?? 0) > 0;

export function filterItems(items: TrackedManga[], view: Pick<LibraryView, "query" | "status" | "unreadOnly">): TrackedManga[] {
  return items.filter(
    (i) => (view.status === "all" || i.reading_status === view.status) && (!view.unreadOnly || hasUnread(i)) && matchesQuery(i, view.query),
  );
}

/** Everything the Library list shows, before it is cut into pages. */
export const applyView = (items: TrackedManga[], view: LibraryView) => sortItems(filterItems(items, view), view.sort);

export interface Page<T> {
  /** The page shown, 1-based, kept within what exists (a page that no longer exists is the last one). */
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last title on this page, for "11 to 20 of 37"; 0 when there are none. */
  from: number;
  to: number;
  items: T[];
}

export function paginate<T>(all: T[], page: number, size = PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const items = all.slice(start, start + size);
  return { page: current, pages, total: all.length, from: items.length ? start + 1 : 0, to: start + items.length, items };
}

/** Whether the view is narrowed by anything (a search, a status, "unread only") as opposed to showing the whole Library. */
export const isNarrowed = (view: LibraryView) => view.query.trim() !== "" || view.status !== "all" || view.unreadOnly;
