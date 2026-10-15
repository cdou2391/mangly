import type { TrackedManga } from "@/api/types";
import { FILTERS, countByFilter, sortLibrary, unreadOf } from "../library";

function item(over: Partial<TrackedManga> & { name: string; read?: string | null; latest?: string | null; at?: string }): TrackedManga {
  const { name, read = null, latest = null, at = "2026-01-01T00:00:00Z", ...rest } = over;
  return {
    id: 1, user_id: 1, manga_id: 1, preferred_source_record_id: null, last_chapter_read: read,
    last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: null, created_at: at, updated_at: at,
    manga: {
      id: 1, canonical_name: name, genres: null, author: null, summary: null, cover_url: null,
      latest_chapter: latest, latest_chapter_url: null, global_status: "ongoing", created_at: at, updated_at: at,
    },
    preferred_source_record: null,
    ...rest,
  } as TrackedManga;
}

describe("sortLibrary", () => {
  it("puts titles you are behind on first, then the most recently updated", () => {
    const sorted = sortLibrary([
      item({ name: "Caught up, old", read: "10", latest: "10", at: "2026-01-01T00:00:00Z" }),
      item({ name: "Behind, old", read: "5", latest: "9", at: "2026-02-01T00:00:00Z" }),
      item({ name: "Caught up, new", read: "7", latest: "7", at: "2026-03-01T00:00:00Z" }),
      item({ name: "Behind, new", read: "1", latest: "4", at: "2026-04-01T00:00:00Z" }),
    ]).map((i) => i.manga.canonical_name);
    expect(sorted).toEqual(["Behind, new", "Behind, old", "Caught up, new", "Caught up, old"]);
  });

  it("falls back to the title for a stable order, and does not mutate its input", () => {
    const input = [item({ name: "B" }), item({ name: "A" })];
    expect(sortLibrary(input).map((i) => i.manga.canonical_name)).toEqual(["A", "B"]);
    expect(input.map((i) => i.manga.canonical_name)).toEqual(["B", "A"]);
  });

  it("treats a title with no read progress as not behind", () => {
    expect(unreadOf(item({ name: "X", read: null, latest: "1130" }))).toBeNull();
  });
});

describe("countByFilter", () => {
  it("counts every status and the total", () => {
    const counts = countByFilter([
      item({ name: "a", reading_status: "reading" }),
      item({ name: "b", reading_status: "reading" }),
      item({ name: "c", reading_status: "completed" }),
      item({ name: "d", reading_status: "dropped" }),
    ]);
    expect(counts).toMatchObject({ all: 4, reading: 2, completed: 1, dropped: 1, plan_to_read: 0, on_hold: 0 });
  });
  it("has a chip for every status", () => {
    expect(FILTERS.map((f) => f.key).sort()).toEqual(
      ["all", "completed", "dropped", "on_hold", "plan_to_read", "reading"].sort(),
    );
  });
});
