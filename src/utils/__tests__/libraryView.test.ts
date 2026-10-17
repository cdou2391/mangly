import type { ReadingStatus, TrackedManga } from "@/api/types";
import { DEFAULT_VIEW, PAGE_SIZE, SORTS, applyView, filterItems, hasUnread, isNarrowed, isSortKey, matchesQuery, normalize, paginate, sortItems, type LibraryView } from "../libraryView";

let n = 0;
function item(name: string, over: Partial<TrackedManga> & { read?: string | null; latest?: string | null; author?: string | null; updated?: string; source?: string | null } = {}): TrackedManga {
  n += 1;
  const { read = "1", latest = "1", author = null, updated = "2026-01-01T00:00:00Z", source = null, ...rest } = over;
  return {
    id: n, user_id: 1, manga_id: n, preferred_source_record_id: null, last_chapter_read: read, last_chapter_url: null, reading_status: "reading" as ReadingStatus,
    user_status_override: null, notifications_enabled: true, rating: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    manga: { id: n, canonical_name: name, genres: null, author, summary: null, cover_url: null, latest_chapter: latest, latest_chapter_url: null, global_status: "ongoing", created_at: "", updated_at: updated },
    preferred_source_record: source ? ({ source_title: source, latest_chapter_at: null } as TrackedManga["preferred_source_record"]) : null,
    ...rest,
  } as TrackedManga;
}
const names = (items: TrackedManga[]) => items.map((i) => i.manga.canonical_name);
const view = (over: Partial<LibraryView> = {}): LibraryView => ({ ...DEFAULT_VIEW, ...over });

describe("searching", () => {
  const berserk = item("Berserk", { author: "Kentaro Miura" });
  const pokemon = item("Pokémon Adventures", { source: "Pocket Monsters Special" });
  const one = item("One Piece", { author: "Eiichiro Oda" });
  const all = [berserk, pokemon, one];

  it("ignores case and accents", () => {
    expect(normalize("Pokémon")).toBe("pokemon");
    expect(names(filterItems(all, view({ query: "POKEMON" })))).toEqual(["Pokémon Adventures"]);
    expect(names(filterItems(all, view({ query: "pokémon" })))).toEqual(["Pokémon Adventures"]);
  });

  it("matches part of a word, anywhere in the title", () => {
    expect(names(filterItems(all, view({ query: "piec" })))).toEqual(["One Piece"]);
    expect(names(filterItems(all, view({ query: "venture" })))).toEqual(["Pokémon Adventures"]);
  });

  it("needs every word, in any order", () => {
    expect(names(filterItems(all, view({ query: "piece one" })))).toEqual(["One Piece"]);
    expect(filterItems(all, view({ query: "one berserk" }))).toEqual([]);
  });

  it("looks in the author and in the title the source site gives it", () => {
    expect(names(filterItems(all, view({ query: "miura" })))).toEqual(["Berserk"]);
    expect(names(filterItems(all, view({ query: "pocket monsters" })))).toEqual(["Pokémon Adventures"]);
  });

  it("is everything for nothing or only spaces", () => {
    expect(filterItems(all, view({ query: "" }))).toHaveLength(3);
    expect(filterItems(all, view({ query: "   " }))).toHaveLength(3);
    expect(matchesQuery(one, "")).toBe(true);
  });

  it("copes with a title with no author and no source record", () => {
    expect(matchesQuery(item("Bare"), "bare")).toBe(true);
    expect(matchesQuery(item("Bare"), "undefined")).toBe(false);
    expect(matchesQuery(item("Bare"), "null")).toBe(false);
  });
});

describe("filtering", () => {
  const items = [
    item("A", { reading_status: "reading", read: "1", latest: "5" }),
    item("B", { reading_status: "reading", read: "5", latest: "5" }),
    item("C", { reading_status: "completed", read: "9", latest: "9" }),
    item("D", { reading_status: "plan_to_read", read: null, latest: "3" }),
  ];

  it("by status", () => {
    expect(names(filterItems(items, view({ status: "completed" })))).toEqual(["C"]);
    expect(filterItems(items, view({ status: "all" }))).toHaveLength(4);
  });

  it("to titles with unread chapters (the ones that show a +N, so not ones not started yet)", () => {
    expect(names(filterItems(items, view({ unreadOnly: true })))).toEqual(["A"]);
    expect(hasUnread(items[1])).toBe(false);
    expect(hasUnread(item("No latest", { latest: null }))).toBe(false);
  });

  it("combines status, unread and the search", () => {
    expect(names(filterItems(items, view({ status: "reading", unreadOnly: true })))).toEqual(["A"]);
    expect(filterItems(items, view({ status: "completed", unreadOnly: true }))).toEqual([]);
    expect(names(filterItems(items, view({ unreadOnly: true, query: "a" })))).toEqual(["A"]);
    expect(filterItems(items, view({ unreadOnly: true, query: "b" }))).toEqual([]);
  });

  it("says whether anything narrows the view", () => {
    expect(isNarrowed(DEFAULT_VIEW)).toBe(false);
    expect(isNarrowed(view({ query: " x " }))).toBe(true);
    expect(isNarrowed(view({ query: "   " }))).toBe(false);
    expect(isNarrowed(view({ status: "dropped" }))).toBe(true);
    expect(isNarrowed(view({ unreadOnly: true }))).toBe(true);
    expect(isNarrowed(view({ sort: "az" }))).toBe(false); // a sort order does not hide anything
  });
});

describe("sorting", () => {
  const items = [
    item("banana", { rating: 3, created_at: "2026-02-01T00:00:00Z", updated: "2026-03-01T00:00:00Z", read: "5", latest: "5" }),
    item("Apple", { rating: 5, created_at: "2026-03-01T00:00:00Z", updated: "2026-01-01T00:00:00Z", read: "1", latest: "5" }),
    item("Cherry", { rating: null, created_at: "2026-01-01T00:00:00Z", updated: "2026-02-01T00:00:00Z", read: "5", latest: "5" }),
    item("Éclair", { rating: 5, created_at: "2026-01-15T00:00:00Z", updated: "2026-02-15T00:00:00Z", read: "5", latest: "5" }),
  ];

  it("has a label for every order, and recognises them", () => {
    expect(SORTS.map((s) => s.key)).toEqual(["behind", "updated", "added", "az", "za", "rating"]);
    expect(SORTS.every((s) => s.label.length > 0)).toBe(true);
    expect(isSortKey("az")).toBe(true);
    expect(isSortKey("nope")).toBe(false);
    expect(isSortKey(undefined)).toBe(false);
  });

  it("A to Z ignores case and accents", () => {
    expect(names(sortItems(items, "az"))).toEqual(["Apple", "banana", "Cherry", "Éclair"]);
    expect(names(sortItems(items, "za"))).toEqual(["Éclair", "Cherry", "banana", "Apple"]);
  });

  it("most unread first puts titles you are behind on at the top", () => {
    expect(names(sortItems(items, "behind"))[0]).toBe("Apple");
  });

  it("recently updated: newest first", () => {
    expect(names(sortItems(items, "updated"))).toEqual(["banana", "Éclair", "Cherry", "Apple"]);
  });

  it("recently added: newest first", () => {
    expect(names(sortItems(items, "added"))).toEqual(["Apple", "banana", "Éclair", "Cherry"]);
  });

  it("highest rated: best first, unrated last, ties by title", () => {
    expect(names(sortItems(items, "rating"))).toEqual(["Apple", "Éclair", "banana", "Cherry"]);
  });

  it("does not change the list it is given", () => {
    const copy = [...items];
    sortItems(items, "za");
    expect(items).toEqual(copy);
  });

  it("applyView filters and then sorts", () => {
    expect(names(applyView(items, view({ query: "e", sort: "az" })))).toEqual(["Apple", "Cherry", "Éclair"]);
  });
});

describe("paging", () => {
  const list = Array.from({ length: 23 }, (_, i) => i + 1);

  it("is ten a page", () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it("cuts a list into pages and says where it is", () => {
    expect(paginate(list, 1)).toEqual({ page: 1, pages: 3, total: 23, from: 1, to: 10, items: list.slice(0, 10) });
    expect(paginate(list, 2)).toMatchObject({ page: 2, from: 11, to: 20 });
    expect(paginate(list, 3)).toEqual({ page: 3, pages: 3, total: 23, from: 21, to: 23, items: [21, 22, 23] });
  });

  it("keeps the page within what exists", () => {
    expect(paginate(list, 9).page).toBe(3);
    expect(paginate(list, 0).page).toBe(1);
    expect(paginate(list, -4).page).toBe(1);
    expect(paginate(list, NaN).page).toBe(1);
    expect(paginate(list, 2.7).page).toBe(2);
  });

  it("is one page for exactly a page, and one empty page for nothing", () => {
    expect(paginate(list.slice(0, 10), 1)).toMatchObject({ pages: 1, from: 1, to: 10 });
    expect(paginate(list.slice(0, 11), 1)).toMatchObject({ pages: 2, to: 10 });
    expect(paginate([], 1)).toEqual({ page: 1, pages: 1, total: 0, from: 0, to: 0, items: [] });
  });

  it("takes a size", () => {
    expect(paginate(list, 2, 5).items).toEqual([6, 7, 8, 9, 10]);
  });
});
