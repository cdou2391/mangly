import { alertCoveredByRead } from "../alerts";

const read = { manga_id: 2, chapter: "Chapter 191" };
const alert = (chapter_released: string, manga_id = 2) => ({ manga_id, chapter_released });

describe("alertCoveredByRead", () => {
  it("covers the chapter that was read", () => expect(alertCoveredByRead(alert("191"), read)).toBe(true));
  it("covers earlier chapters of the same title", () => {
    expect(alertCoveredByRead(alert("190"), read)).toBe(true);
    expect(alertCoveredByRead(alert("Chapter 1"), read)).toBe(true);
  });
  it("leaves later chapters unread", () => {
    expect(alertCoveredByRead(alert("192"), read)).toBe(false);
    expect(alertCoveredByRead(alert("191.5"), read)).toBe(false);
  });
  it("never touches another title", () => expect(alertCoveredByRead(alert("191", 3), read)).toBe(false));
  it("compares numbers, not text ('Chapter 190' vs '190')", () => {
    expect(alertCoveredByRead(alert("Chapter 190"), { manga_id: 2, chapter: "191" })).toBe(true);
    expect(alertCoveredByRead(alert("9"), { manga_id: 2, chapter: "10" })).toBe(true); // 9 < 10, unlike a string comparison
  });
  it("needs an identical label when there is no number to compare", () => {
    expect(alertCoveredByRead(alert("Oneshot"), { manga_id: 2, chapter: "Oneshot" })).toBe(true);
    expect(alertCoveredByRead(alert("Oneshot"), { manga_id: 2, chapter: "Prologue" })).toBe(false);
    expect(alertCoveredByRead(alert("Oneshot"), read)).toBe(false);
  });
});
