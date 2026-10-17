import { chapterToStore, formatChapter, parseChapter, parseDraft, readProgress, shortChapter, stepChapter, unreadChapters, urlChapter } from "../chapters";

describe("parseChapter", () => {
  it.each([
    ["188", 188],
    ["Chapter 188", 188],
    ["Chapter 188.5", 188.5],
    ["ch. 12", 12],
    ["Episode 5", 5],
    ["Vol.3 Chapter 12", 12], // the number after "Chapter", not the volume
    ["Chapter 12 - The Name 2", 12], // not a number inside the title
    ["Season 2 Episode 5", 5],
    ["Final 7", 7], // no keyword: first number
  ])("%s -> %s", (label, expected) => expect(parseChapter(label)).toBe(expected));

  it.each([["Oneshot"], [""], [null], [undefined]])("%s has no number", (label) =>
    expect(parseChapter(label as string)).toBeNull(),
  );
});

describe("shortChapter", () => {
  it("shortens and normalises", () => {
    expect(shortChapter("188")).toBe("Ch. 188");
    expect(shortChapter("188.5")).toBe("Ch. 188.5");
    expect(shortChapter("Chapter 188")).toBe("Ch. 188");
    expect(shortChapter("chapter188")).toBe("Ch. 188");
    expect(shortChapter(" Oneshot ")).toBe("Oneshot");
  });
  it("is null for nothing", () => {
    expect(shortChapter(null)).toBeNull();
    expect(shortChapter("  ")).toBeNull();
  });
});

describe("unreadChapters", () => {
  it("counts whole chapters behind", () => expect(unreadChapters("188", "191")).toBe(3));
  it("is zero when caught up or ahead (sources disagree)", () => {
    expect(unreadChapters("191", "191")).toBe(0);
    expect(unreadChapters("195", "191")).toBe(0);
  });
  it("ignores a .5 bonus chapter", () => expect(unreadChapters("188", "188.5")).toBe(0));
  it("is null, not a huge number, when nothing has been read", () => {
    expect(unreadChapters(null, "1130")).toBeNull();
    expect(unreadChapters("", "1130")).toBeNull();
  });
  it("is null when a label has no number", () => {
    expect(unreadChapters("Oneshot", "12")).toBeNull();
    expect(unreadChapters("12", null)).toBeNull();
  });
});

describe("readProgress", () => {
  it("is read over latest", () => expect(readProgress("90", "100")).toBeCloseTo(0.9));
  it("is clamped to 0..1", () => {
    expect(readProgress("120", "100")).toBe(1);
    expect(readProgress("0", "100")).toBe(0);
  });
  it("is null when it cannot be told", () => {
    expect(readProgress(null, "100")).toBeNull();
    expect(readProgress("5", "0")).toBeNull();
    expect(readProgress("5", "Oneshot")).toBeNull();
  });
});

describe("chapterToStore", () => {
  it.each([
    ["191", "191"],
    ["Chapter 191", "191"],
    ["Ch. 12.5", "12.5"],
    ["Vol.3 Chapter 42", "42"], // the web app's regex would save "3 Chapter 42"
    ["Chapter 12 - The Name 2", "12"],
    ["Chapter 007", "7"],
  ])("%s -> %s", (label, expected) => expect(chapterToStore(label)).toBe(expected));

  it("keeps a label that has no number", () => {
    expect(chapterToStore("  Oneshot ")).toBe("Oneshot");
    expect(chapterToStore("Prologue")).toBe("Prologue");
  });
});

describe("typing a chapter", () => {
  it("accepts whole and decimal numbers, with a comma too, and trims", () => {
    expect(parseDraft("188")).toBe(188);
    expect(parseDraft(" 188.5 ")).toBe(188.5);
    expect(parseDraft("188,5")).toBe(188.5);
    expect(parseDraft("0")).toBe(0);
    expect(parseDraft("99999")).toBe(99999);
  });
  it("rejects anything else, and numbers beyond the limit", () => {
    for (const bad of ["", "  ", "abc", "-1", "1.", ".5", "1.2.3", "Chapter 3", "100000"]) expect(parseDraft(bad)).toBeNull();
  });
  it("writes a number without float noise", () => {
    expect(formatChapter(188)).toBe("188");
    expect(formatChapter(188.5)).toBe("188.5");
    expect(formatChapter(0.1 + 0.2)).toBe("0.3");
  });
  it("steps one chapter up or down, starting from 0 when there is nothing typed", () => {
    expect(stepChapter("188", 1)).toBe("189");
    expect(stepChapter("188", -1)).toBe("187");
    expect(stepChapter("188.5", 1)).toBe("189.5");
    expect(stepChapter("", 1)).toBe("1");
    expect(stepChapter("abc", 1)).toBe("1");
  });
  it("stops at 0 and at the limit", () => {
    expect(stepChapter("0", -1)).toBe("0");
    expect(stepChapter("0.5", -1)).toBe("0");
    expect(stepChapter("99999", 1)).toBe("99999");
  });
});

describe("the chapter a link is for", () => {
  it("reads the number from the link", () => {
    expect(urlChapter("https://x.test/manga/naruto/chapter-188/")).toBe(188);
    expect(urlChapter("https://x.test/manga/naruto/chapter-188-5/")).toBe(188.5);
    expect(urlChapter("https://x.test/read/ch_12")).toBe(12);
    expect(urlChapter("https://x.test/manga/ep/7")).toBe(7);
  });
  it("is null when the link does not say, or there is none", () => {
    expect(urlChapter("https://weeb.test/chapters/01HQ8ZXK3N")).toBeNull();
    expect(urlChapter(null)).toBeNull();
    expect(urlChapter(undefined)).toBeNull();
  });
});
