import type { TrackedManga } from "@/api/types";
import { computeStats } from "../stats";

const NOW = new Date("2026-10-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let id = 0;
function item(over: Partial<TrackedManga> = {}, manga: Partial<TrackedManga["manga"]> = {}): TrackedManga {
  id += 1;
  return {
    id, user_id: 1, manga_id: id, preferred_source_record_id: 1, last_chapter_read: "10", last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: null, created_at: daysAgo(100), updated_at: daysAgo(1),
    manga: { id, canonical_name: `Title ${id}`, genres: [], author: null, summary: null, cover_url: null, latest_chapter: "10", latest_chapter_url: null, global_status: "ongoing", created_at: "", updated_at: "", ...manga },
    preferred_source_record: { source: "mangaread" } as TrackedManga["preferred_source_record"],
    ...over,
  } as TrackedManga;
}
const stats = (items: TrackedManga[]) => computeStats(items, NOW, (s) => s.toUpperCase());

describe("an empty library", () => {
  it("is all zeros and nothing rated", () => {
    expect(stats([])).toEqual({
      titles: 0, chaptersRead: 0, chaptersBehind: 0, titlesBehind: 0, rated: 0, averageRating: null, ratings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byStatus: [], genres: [], sources: [], addedLast30Days: 0, furthestBehind: [],
    });
  });
});

describe("chapters", () => {
  it("adds up the chapter number last read in each title, ignoring decimals and titles without a number", () => {
    const s = stats([item({ last_chapter_read: "698" }), item({ last_chapter_read: "Chapter 12.5" }), item({ last_chapter_read: null }), item({ last_chapter_read: "Oneshot" })]);
    expect(s.chaptersRead).toBe(698 + 12);
  });

  it("adds up how far behind you are, and in how many titles", () => {
    const s = stats([
      item({ last_chapter_read: "90" }, { latest_chapter: "100" }), // 10 behind
      item({ last_chapter_read: "5" }, { latest_chapter: "8" }), // 3 behind
      item({ last_chapter_read: "10" }, { latest_chapter: "10" }), // caught up
      item({ last_chapter_read: null }, { latest_chapter: "50" }), // not started: cannot be told
    ]);
    expect(s.chaptersBehind).toBe(13);
    expect(s.titlesBehind).toBe(2);
  });

  it("lists the three titles you are furthest behind on, the biggest gap first", () => {
    const s = stats([
      item({ last_chapter_read: "1" }, { latest_chapter: "6", canonical_name: "Five" }),
      item({ last_chapter_read: "1" }, { latest_chapter: "101", canonical_name: "Hundred" }),
      item({ last_chapter_read: "1" }, { latest_chapter: "21", canonical_name: "Twenty" }),
      item({ last_chapter_read: "1" }, { latest_chapter: "11", canonical_name: "Ten" }),
      item({ last_chapter_read: "1" }, { latest_chapter: "11", canonical_name: "Another ten" }),
    ]);
    expect(s.furthestBehind.map((t) => [t.title, t.behind])).toEqual([["Hundred", 100], ["Twenty", 20], ["Another ten", 10]]);
    expect(typeof s.furthestBehind[0].id).toBe("number");
  });
});

describe("ratings", () => {
  it("counts each rating and averages the rated titles to one decimal", () => {
    const s = stats([item({ rating: 5 }), item({ rating: 5 }), item({ rating: 4 }), item({ rating: 1 }), item({ rating: null })]);
    expect(s.rated).toBe(4);
    expect(s.ratings).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
    expect(s.averageRating).toBe(3.8); // 15 / 4 = 3.75
  });

  it("is null, not 0, when nothing is rated", () => {
    expect(stats([item(), item()]).averageRating).toBeNull();
  });

  it("ignores a rating outside 1 to 5 instead of breaking", () => {
    const s = stats([item({ rating: 9 as never }), item({ rating: 0 as never }), item({ rating: 3 })]);
    expect(s.rated).toBe(1);
    expect(s.averageRating).toBe(3);
  });
});

describe("status", () => {
  it("counts each status, in a fixed order, leaving out the ones with nothing", () => {
    const s = stats([item({ reading_status: "dropped" }), item({ reading_status: "reading" }), item({ reading_status: "reading" }), item({ reading_status: "completed" })]);
    expect(s.byStatus).toEqual([{ status: "reading", count: 2 }, { status: "completed", count: 1 }, { status: "dropped", count: 1 }]);
  });
});

describe("genres", () => {
  it("counts genres ignoring case and spaces, most common first, ties A to Z", () => {
    const s = stats([
      item({}, { genres: ["Action", "Fantasy"] }),
      item({}, { genres: ["action ", "Drama"] }),
      item({}, { genres: ["ACTION", "Fantasy"] }),
      item({}, { genres: null }),
    ]);
    expect(s.genres).toEqual([{ label: "Action", count: 3 }, { label: "Fantasy", count: 2 }, { label: "Drama", count: 1 }]);
  });

  it("counts a genre once per title even when it is listed twice", () => {
    expect(stats([item({}, { genres: ["Action", "action"] })]).genres).toEqual([{ label: "Action", count: 1 }]);
  });

  it("keeps the eight most common", () => {
    const genres = Array.from({ length: 12 }, (_, i) => `G${String(i).padStart(2, "0")}`);
    expect(stats([item({}, { genres })]).genres).toHaveLength(8);
  });

  it("skips empty names", () => {
    expect(stats([item({}, { genres: ["", "  ", "Action"] })]).genres).toEqual([{ label: "Action", count: 1 }]);
  });
});

describe("sites", () => {
  it("counts titles per site by its display name, and puts titles without one under Unknown", () => {
    const s = stats([
      item(),
      item(),
      item({ preferred_source_record: { source: "weebcentral" } as never }),
      item({ preferred_source_record: null }),
    ]);
    expect(s.sources).toEqual([{ label: "MANGAREAD", count: 2 }, { label: "Unknown", count: 1 }, { label: "WEEBCENTRAL", count: 1 }]);
  });
});

describe("recently added", () => {
  it("counts the titles added in the last 30 days, and not older ones or ones dated in the future", () => {
    const s = stats([
      item({ created_at: daysAgo(0) }),
      item({ created_at: daysAgo(30) }),
      item({ created_at: daysAgo(31) }),
      item({ created_at: daysAgo(-10) }), // a clock set wrong
      item({ created_at: "not a date" }),
    ]);
    expect(s.addedLast30Days).toBe(2);
  });
});
