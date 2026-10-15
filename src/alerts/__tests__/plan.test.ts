import type { AppNotification } from "@/api/types";
import { MAX_SEPARATE, alertContents, newAlerts, newestId } from "../plan";

const alert = (id: number, title: string, chapter: string, read = false) =>
  ({ id, is_read: read, chapter_released: chapter, manga: { canonical_name: title } }) as AppNotification;

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
      { identifier: "alert-5", title: "Chainsaw Man", body: "Ch. 191 is out" },
      { identifier: "alert-6", title: "Dandadan", body: "Ch. 164 is out" },
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
    expect(alertContents(many)).toEqual([{ identifier: "alerts-summary", title: "5 new chapters", body: "Title 1, Title 2, Title 3 and 2 more" }]);
  });

  it("counts titles once in the summary, not chapters", () => {
    const many = [alert(1, "A", "1"), alert(2, "A", "2"), alert(3, "A", "3"), alert(4, "B", "1")];
    expect(alertContents(many)).toEqual([{ identifier: "alerts-summary", title: "4 new chapters", body: "A, B" }]);
  });

  it("uses separate notifications up to the limit and a summary just past it", () => {
    expect(alertContents([1, 2, 3].map((i) => alert(i, `T${i}`, `${i}`)))).toHaveLength(3);
    expect(alertContents([1, 2, 3, 4].map((i) => alert(i, `T${i}`, `${i}`)))).toHaveLength(1);
  });
});
