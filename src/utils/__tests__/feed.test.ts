import type { AppNotification, RecentChapter, TrackedManga } from "@/api/types";
import { buildFeed, formatWhen, fromRecent, groupByDay, type FeedItem } from "../feed";

const NOW = new Date(2026, 9, 15, 14, 0, 0); // Thu 15 Oct 2026, 14:00 local
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const manga = (id: number, name: string) => ({ id, canonical_name: name, cover_url: `c${id}` }) as AppNotification["manga"];
const alert = (id: number, mangaId: number, chapter: string, at: string, isRead = false): AppNotification => ({
  id, user_id: 1, manga_id: mangaId, source_record_id: null, chapter_released: chapter, latest_chapter_url: `https://x.test/${mangaId}/${id}`,
  source: "mangaread", is_read: isRead, created_at: at, manga: manga(mangaId, `Title ${mangaId}`),
});
const recent = (mangaId: number, chapter: string, at: string | null, isNew = true): RecentChapter => ({
  tracking_id: mangaId * 10, manga_id: mangaId, manga_title: `Title ${mangaId}`, manga_cover_url: null, chapter, chapter_url: `https://x.test/${mangaId}`,
  chapter_at: at, source: "weebcentral", is_new: isNew,
});
const tracked = (mangaId: number) => ({ id: mangaId * 10, manga_id: mangaId }) as TrackedManga;

describe("buildFeed", () => {
  it("shows a chapter once when it has both a notification and a latest-chapter entry, as the notification", () => {
    const items = buildFeed([alert(5, 1, "Chapter 191", ago(HOUR))], [recent(1, "191", ago(2 * HOUR))], [tracked(1)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ notification_id: 5, chapter: "Chapter 191", source: "mangaread", unread: true, tracking_id: 10 });
  });

  it("adds the latest chapter of titles that have no notification for it (e.g. notifications turned off)", () => {
    const items = buildFeed([alert(5, 1, "191", ago(HOUR))], [recent(1, "191", ago(HOUR)), recent(2, "64", ago(3 * HOUR))], [tracked(1), tracked(2)]);
    expect(items.map((i) => [i.manga_id, i.notification_id])).toEqual([[1, 5], [2, null]]);
    expect(items[1]).toMatchObject({ unread: true, tracking_id: 20, title: "Title 2" });
  });

  it("keeps older chapters of a title, which only the notification history knows about", () => {
    const items = buildFeed([alert(6, 1, "191", ago(HOUR)), alert(5, 1, "190", ago(2 * DAY))], [recent(1, "191", ago(HOUR))], [tracked(1)]);
    expect(items.map((i) => i.chapter)).toEqual(["191", "190"]);
  });

  it("sorts newest first, with items of unknown time last", () => {
    const items = buildFeed(undefined, [recent(1, "1", null), recent(2, "1", ago(5 * DAY)), recent(3, "1", ago(HOUR))], undefined);
    expect(items.map((i) => i.manga_id)).toEqual([3, 2, 1]);
  });

  it("treats a read notification as read", () => {
    const [item] = buildFeed([alert(5, 1, "191", ago(HOUR), true)], [], [tracked(1)]);
    expect(item.unread).toBe(false);
  });

  it("treats an alert as read when your progress already covers it, so it never disagrees with the Library", () => {
    const items = buildFeed(
      [alert(7, 1, "191", ago(HOUR)), alert(6, 1, "190", ago(2 * HOUR)), alert(8, 1, "192", ago(MIN))],
      [recent(1, "191", ago(HOUR), false)], // caught up to 191
      [tracked(1)],
    );
    const byChapter = Object.fromEntries(items.map((i) => [i.chapter, i.unread]));
    expect(byChapter).toEqual({ "190": false, "191": false, "192": true }); // 192 is past the latest we know: stays unread
  });

  it("does not hide an unread alert when the title still has something new", () => {
    const [item] = buildFeed([alert(5, 1, "190", ago(HOUR))], [recent(1, "191", ago(MIN), true)], [tracked(1)]);
    expect(item.unread).toBe(true);
  });

  it("drops alerts for titles you no longer track, but only when the tracked list is known", () => {
    const stale = alert(5, 9, "3", ago(HOUR));
    expect(buildFeed([stale], [], [tracked(1)])).toHaveLength(0);
    expect(buildFeed([stale], [], undefined)).toHaveLength(1);
  });

  it("matches chapters by number, not by wording", () => {
    const items = buildFeed([alert(5, 1, "Vol.2 Chapter 12", ago(HOUR))], [recent(1, "12", ago(HOUR))], [tracked(1)]);
    expect(items).toHaveLength(1);
  });

  it("copes with a chapter label that has no number", () => {
    const items = buildFeed([alert(5, 1, "Oneshot", ago(HOUR))], [recent(1, "ONESHOT ", ago(HOUR))], [tracked(1)]);
    expect(items).toHaveLength(1);
  });

  it("works when either list is missing", () => {
    expect(buildFeed(undefined, undefined, undefined)).toEqual([]);
    expect(buildFeed([alert(5, 1, "1", ago(HOUR))], undefined, undefined)).toHaveLength(1);
    expect(buildFeed(undefined, [recent(1, "1", ago(HOUR))], undefined)).toHaveLength(1);
  });
});

describe("fromRecent", () => {
  it("carries over what is needed to open and mark a chapter", () => {
    expect(fromRecent(recent(3, "Chapter 7", ago(HOUR), false))).toMatchObject({
      manga_id: 3, tracking_id: 30, chapter: "Chapter 7", unread: false, notification_id: null,
    });
  });
});

describe("groupByDay", () => {
  const at = (iso: string): FeedItem => ({ ...fromRecent(recent(1, "1", iso)), key: iso });
  const local = (d: number, h: number) => new Date(2026, 9, d, h, 0, 0).toISOString();

  it("groups into today, yesterday, earlier this week and earlier, skipping empty groups", () => {
    const groups = groupByDay([at(local(15, 9)), at(local(14, 23)), at(local(12, 8)), at(local(2, 8))], NOW);
    expect(groups.map((g) => [g.group, g.title, g.data.length])).toEqual([
      ["today", "TODAY", 1], ["yesterday", "YESTERDAY", 1], ["week", "EARLIER THIS WEEK", 1], ["earlier", "EARLIER", 1],
    ]);
    expect(groupByDay([at(local(15, 1))], NOW).map((g) => g.group)).toEqual(["today"]);
  });

  it("uses calendar days: 00:30 today is today, 23:30 last night is yesterday", () => {
    expect(groupByDay([at(local(15, 0))], NOW)[0].group).toBe("today");
    expect(groupByDay([at(new Date(2026, 9, 14, 23, 30).toISOString())], NOW)[0].group).toBe("yesterday");
  });

  it("puts items with an unknown time under Earlier", () => {
    expect(groupByDay([{ ...at(local(15, 9)), at: null }], NOW)[0].group).toBe("earlier");
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("formatWhen", () => {
  it("says how long ago for today", () => {
    expect(formatWhen(ago(10_000), NOW)).toBe("Just now");
    expect(formatWhen(ago(45 * MIN), NOW)).toBe("45m ago");
    expect(formatWhen(ago(5 * HOUR), NOW)).toBe("5h ago");
  });
  it("names yesterday, then the weekday, then the date", () => {
    expect(formatWhen(new Date(2026, 9, 14, 18, 40).toISOString(), NOW)).toBe("Yesterday");
    expect(formatWhen(new Date(2026, 9, 12, 9, 0).toISOString(), NOW)).toBe("Mon");
    expect(formatWhen(new Date(2026, 9, 3, 9, 0).toISOString(), NOW)).toBe("Oct 3");
  });
  it("is empty when the time is unknown or invalid", () => {
    expect(formatWhen(null, NOW)).toBe("");
    expect(formatWhen("not a date", NOW)).toBe("");
  });
  it("never goes negative if the server clock is ahead", () => {
    expect(formatWhen(new Date(NOW.getTime() + 5 * MIN).toISOString(), NOW)).toBe("Just now");
  });
});
