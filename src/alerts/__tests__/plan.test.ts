import type { AppNotification } from "@/api/types";
import { MAX_SEPARATE, alertContents, delayMinutes, newAlerts, newestId, tapTarget } from "../plan";

const alert = (id: number, title: string, chapter: string, read = false) =>
  ({ id, is_read: read, chapter_released: chapter, manga_id: id * 10, latest_chapter_url: `https://x.test/${id}`, manga: { canonical_name: title } }) as AppNotification;

describe("newestId", () => {
  it("is the highest id, and 0 for nothing", () => {
    expect(newestId([alert(3, "a", "1"), alert(9, "b", "1"), alert(5, "c", "1")])).toBe(9);
    expect(newestId([])).toBe(0);
  });
});

describe("newAlerts", () => {
  const list = [alert(9, "C", "3"), alert(5, "B", "2"), alert(7, "X", "9", true), alert(2, "A", "1")];

  it("tells nothing until there is a baseline: the existing backlog is not news", () => {
    expect(newAlerts(list, null)).toEqual([]);
  });

  it("is the unread ones after the baseline, oldest first", () => {
    expect(newAlerts(list, 4).map((n) => n.id)).toEqual([5, 9]);
  });

  it("leaves out alerts already read, wherever they were read", () => {
    expect(newAlerts(list, 4).map((n) => n.id)).not.toContain(7);
  });

  it("is empty when nothing is newer than the baseline", () => {
    expect(newAlerts(list, 9)).toEqual([]);
  });
});

describe("alertContents", () => {
  it("is nothing for nothing", () => {
    expect(alertContents([])).toEqual([]);
  });

  it("is one notification per chapter, named after the title, for a few", () => {
    expect(alertContents([alert(5, "Chainsaw Man", "Chapter 191"), alert(6, "Dandadan", "164")])).toEqual([
      {
        identifier: "alert-5", title: "Chainsaw Man", body: "Ch. 191 is out",
        data: { screen: "updates", alertId: 5, mangaId: 50, chapter: "Chapter 191", chapterUrl: "https://x.test/5" },
      },
      {
        identifier: "alert-6", title: "Dandadan", body: "Ch. 164 is out",
        data: { screen: "updates", alertId: 6, mangaId: 60, chapter: "164", chapterUrl: "https://x.test/6" },
      },
    ]);
  });

  it("copes with a missing title or chapter", () => {
    const [c] = alertContents([{ id: 1, chapter_released: "", manga: null } as unknown as AppNotification]);
    expect(c.title).toBe("A title in your library");
    expect(c.body).toBe("A new chapter is out");
  });

  it("folds a flood into one summary, so a long absence is one notification", () => {
    const many = [1, 2, 3, 4, 5].map((i) => alert(i, `Title ${i}`, `${i}`));
    expect(MAX_SEPARATE).toBe(3);
    expect(alertContents(many)).toEqual([
      { identifier: "alerts-summary", title: "5 new chapters", body: "Title 1, Title 2, Title 3 and 2 more", data: { screen: "updates" } },
    ]);
  });

  it("counts titles once in the summary, not chapters", () => {
    const many = [alert(1, "A", "1"), alert(2, "A", "2"), alert(3, "A", "3"), alert(4, "B", "1")];
    expect(alertContents(many)).toEqual([{ identifier: "alerts-summary", title: "4 new chapters", body: "A, B", data: { screen: "updates" } }]);
  });

  it("uses separate notifications up to the limit and a summary just past it", () => {
    expect(alertContents([1, 2, 3].map((i) => alert(i, `T${i}`, `${i}`)))).toHaveLength(3);
    expect(alertContents([1, 2, 3, 4].map((i) => alert(i, `T${i}`, `${i}`)))).toHaveLength(1);
  });
});

describe("a summary opens Updates, a single chapter opens that chapter", () => {
  it("carries no chapter in a summary, so a tap on it can only open Updates", () => {
    const [summary] = alertContents([1, 2, 3, 4].map((i) => alert(i, `T${i}`, `${i}`)));
    expect(tapTarget(summary.data)).toBeNull();
  });

  it("names the alert, the title, the chapter and its link in a single notification", () => {
    const [c] = alertContents([alert(5, "Chainsaw Man", "Chapter 191")]);
    expect(tapTarget(c.data)).toEqual({ notification_id: 5, manga_id: 50, chapter: "Chapter 191", chapter_url: "https://x.test/5" });
  });
});

describe("tapTarget", () => {
  const good = { screen: "updates", alertId: 5, mangaId: 50, chapter: "191", chapterUrl: "https://x.test/191" };

  it("reads what a notification carries", () => {
    expect(tapTarget(good)).toEqual({ notification_id: 5, manga_id: 50, chapter: "191", chapter_url: "https://x.test/191" });
  });

  it("is null for anything that is not a single chapter: Updates only, an older notification, nothing at all", () => {
    for (const bad of [undefined, null, "x", 3, {}, { screen: "updates" }, { ...good, alertId: "5" }, { ...good, mangaId: undefined }, { ...good, chapter: "" }, { ...good, chapter: 191 }]) {
      expect(tapTarget(bad)).toBeNull();
    }
  });

  it("opens the title instead of the chapter when there is no usable link", () => {
    expect(tapTarget({ ...good, chapterUrl: null })?.chapter_url).toBeNull();
    expect(tapTarget({ ...good, chapterUrl: undefined })?.chapter_url).toBeNull();
  });

  it("only ever opens web links", () => {
    for (const url of ["intent://x#Intent;end", "javascript:alert(1)", "file:///etc/passwd", "mangly://x", "//x.test/a", "x.test/a"]) {
      expect(tapTarget({ ...good, chapterUrl: url })?.chapter_url).toBeNull();
    }
    expect(tapTarget({ ...good, chapterUrl: "HTTP://x.test/a" })?.chapter_url).toBe("HTTP://x.test/a");
  });
});

describe("delayMinutes", () => {
  const made = (iso: string) => ({ created_at: iso }) as AppNotification;
  const now = Date.parse("2026-10-17T12:00:00Z");

  it("is the minutes since the alert was created, rounded", () => {
    expect(delayMinutes(made("2026-10-17T11:30:00Z"), now)).toBe(30);
    expect(delayMinutes(made("2026-10-17T11:29:20Z"), now)).toBe(31);
    expect(delayMinutes(made("2026-10-16T12:00:00Z"), now)).toBe(1440);
  });

  it("is never negative, even if the phone's clock is behind", () => {
    expect(delayMinutes(made("2026-10-17T12:05:00Z"), now)).toBe(0);
  });

  it("is null when the time cannot be read", () => {
    expect(delayMinutes(made("later"), now)).toBeNull();
    expect(delayMinutes({} as AppNotification, now)).toBeNull();
  });
});
