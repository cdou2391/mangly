import type { SearchCandidate, TrackedManga } from "@/api/types";

/** A title with its spelling flattened so the same title compares equal across sources: "Dragon Ball!" = "dragon  ball". */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * One title, as found on one or more source sites. Tracking is per title, not per site: the server keeps a separate
 * entry for each site a title is tracked from, so offering each site as its own "Track" would put the same title in
 * the library twice.
 */
export interface TitleGroup {
  key: string;
  title: string;
  author: string | null;
  status: string | null;
  cover_url: string | null;
  /** Every site that has it, in the order the server returned them. One per site. */
  candidates: SearchCandidate[];
}

/** Groups search results by title, keeping the server's order (a group sits where its first result was). */
export function groupCandidates(results: SearchCandidate[] | undefined): TitleGroup[] {
  const groups = new Map<string, TitleGroup>();
  for (const c of results ?? []) {
    const key = normalizeTitle(c.title) || c.url;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { key, title: c.title, author: c.author, status: c.status, cover_url: c.cover_url, candidates: [c] });
      continue;
    }
    if (!g.candidates.some((x) => x.source === c.source)) g.candidates.push(c);
    g.author ??= c.author;
    g.status ??= c.status;
    g.cover_url ??= c.cover_url;
  }
  return [...groups.values()];
}

/** The group's sites with `source` first (when it has it), which is the order to try them in when tracking. */
export function candidatesFor(group: TitleGroup, source: string | null): SearchCandidate[] {
  if (!source) return group.candidates;
  return [...group.candidates].sort((a, b) => Number(b.source === source) - Number(a.source === source));
}

/**
 * The sites to offer as a filter: only when filtering by one of them would actually hide something, i.e. some title is
 * not on every site. When every title is on every site the choice would change nothing, so there is none to offer.
 */
export function sourcesIn(groups: TitleGroup[]): string[] {
  const all = [...new Set(groups.flatMap((g) => g.candidates.map((c) => c.source)))].sort();
  const narrows = all.some((s) => groups.some((g) => !g.candidates.some((c) => c.source === s)));
  return narrows ? all : [];
}

const trimSlash = (url: string) => url.replace(/\/+$/, "").toLowerCase();

/**
 * The library entry for this title, if it is already tracked. Matches by the link of the source the title is tracked
 * from, or by title (the server stores the title it scraped, and a title can be spelled a little differently per site).
 * This is a convenience only: the server refuses a duplicate anyway, and that answer is handled too.
 */
export function findInLibrary(group: TitleGroup, tracked: TrackedManga[] | undefined): TrackedManga | null {
  if (!tracked) return null;
  const urls = new Set(group.candidates.map((c) => trimSlash(c.url)));
  const names = new Set([group.key, ...group.candidates.flatMap((c) => c.alternative_titles.map(normalizeTitle))].filter(Boolean));
  return (
    tracked.find((t) => {
      const url = t.preferred_source_record?.manga_details_url;
      if (url && urls.has(trimSlash(url))) return true;
      return names.has(normalizeTitle(t.manga.canonical_name));
    }) ?? null
  );
}
