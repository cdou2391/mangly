import type { TrackedManga } from "@/api/types";
import { continueCards, nextLine, savedChapterUrl, toGoLine } from "../continueReading";

const item = (id: number, over: Partial<TrackedManga> = {}, latest: string | null = "45"): TrackedManga =>
  ({
    id, user_id: 1, manga_id: id, preferred_source_record_id: null, last_chapter_read: "23", last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", preferred_source_record: null,
    manga: { id, canonical_name: `Title ${id}`, genres: null, author: null, summary: null, cover_url: "c.jpg", latest_chapter: latest, latest_chapter_url: null, global_status: "ongoing", created_at: "", updated_at: "" },
    ...over,
  }) as TrackedManga;

describe("savedChapterUrl", () => {
  it("keeps the saved link when it names the chapter being read, or does not name one", () => {
    expect(savedChapterUrl(item(1, { last_chapter_url: "https://x.test/m/chapter-23/" }))).toBe("https://x.test/m/chapter-23/");
    expect(savedChapterUrl(item(1, { last_chapter_url: "https://weeb.test/chapters/01HQ8Z" }))).toBe("https://weeb.test/chapters/01HQ8Z");
    expect(savedChapterUrl(item(1, { last_chapter_read: null, last_chapter_url: "https://x.test/m/chapter-23/" }))).toBe("https://x.test/m/chapter-23/");
  });
  it("drops a link that is plainly for another chapter, and a missing one", () => {
    expect(savedChapterUrl(item(1, { last_chapter_url: "https://x.test/m/chapter-40/" }))).toBeNull();
    expect(savedChapterUrl(item(1))).toBeNull();
  });
});

describe("continueCards", () => {
  it("suggests the chapter after the last one read, and how many are left", () => {
    const [card] = continueCards([item(1, { last_chapter_url: "https://x.test/m/chapter-23/" })]);
    expect(card).toEqual({ trackingId: 1, title: "Title 1", coverUrl: "c.jpg", read: 23, next: 24, toGo: 22, url: "https://x.test/m/chapter-23/" });
    expect(nextLine(card)).toBe("Next up: Ch. 24");
    expect(toGoLine(card)).toBe("You're on Ch. 23 · 22 chapters to go");
  });

  it("counts a half chapter as the one before it", () => {
    const [card] = continueCards([item(1, { last_chapter_read: "23.5" })]);
    expect(card.next).toBe(24);
    expect(card.toGo).toBe(22);
  });

  it("says one chapter, not one chapters", () => {
    const [card] = continueCards([item(1, { last_chapter_read: "44" })]);
    expect(toGoLine(card)).toBe("You're on Ch. 44 · 1 chapter to go");
  });

  it("leaves out titles that are caught up, not started, without a number, or not being read", () => {
    expect(
      continueCards([
        item(1, { last_chapter_read: "45" }), // caught up
        item(2, { last_chapter_read: null }), // not started
        item(3, { last_chapter_read: "0" }), // not started
        item(4, { last_chapter_read: "Oneshot" }), // no number
        item(5, { reading_status: "plan_to_read" }),
        item(6, { reading_status: "on_hold" }),
        item(7, { reading_status: "dropped" }),
        item(8, { reading_status: "completed" }),
        item(9, {}, null), // latest unknown
        item(10, { last_chapter_read: "50" }), // ahead of the latest
      ]),
    ).toEqual([]);
  });

  it("puts the most recently touched first and offers at most three", () => {
    const cards = continueCards([
      item(1, { updated_at: "2026-10-01T00:00:00Z" }),
      item(2, { updated_at: "2026-10-05T00:00:00Z" }),
      item(3, { updated_at: "2026-10-03T00:00:00Z" }),
      item(4, { updated_at: "2026-10-04T00:00:00Z" }),
    ]);
    expect(cards.map((c) => c.trackingId)).toEqual([2, 4, 3]);
    expect(continueCards([item(1), item(2)], 1)).toHaveLength(1);
  });

  it("has no link when the saved one is for another chapter", () => {
    expect(continueCards([item(1, { last_chapter_url: "https://x.test/m/chapter-40/" })])[0].url).toBeNull();
  });
});
