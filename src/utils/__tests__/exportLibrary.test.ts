import type { TrackedManga } from "@/api/types";
import { EXPORT_TYPES, exportFileName, exportText, toCsv, toJson } from "../exportLibrary";

const NOW = "2026-10-14T12:00:00Z";
function item(name: string, over: Partial<TrackedManga> = {}, manga: Partial<TrackedManga["manga"]> = {}): TrackedManga {
  return {
    id: 1, user_id: 1, manga_id: 1, preferred_source_record_id: 9, last_chapter_read: "698", last_chapter_url: null, reading_status: "reading", user_status_override: null,
    notifications_enabled: true, rating: 4, created_at: NOW, updated_at: NOW,
    manga: { id: 1, canonical_name: name, genres: ["Action", "Fantasy"], author: "Kishimoto", summary: "secret summary", cover_url: null, latest_chapter: "Chapter 700.5", latest_chapter_url: null, global_status: "ongoing", created_at: NOW, updated_at: NOW, ...manga },
    preferred_source_record: { id: 9, manga_id: 1, source: "mangaread", source_title: name, manga_details_url: "https://x.test/naruto/", latest_chapter: null, latest_chapter_url: null, latest_chapter_at: null, last_scraped_at: null },
    ...over,
  } as TrackedManga;
}

const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

describe("CSV", () => {
  it("starts with a byte-order mark so Excel reads accents, and uses Windows line endings", () => {
    const csv = toCsv([item("Naruto")]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it("has a header row, then a row per title with the reader's own data", () => {
    const [header, row] = lines(toCsv([item("Naruto")]));
    expect(header).toBe("title,author,reading_status,rating,last_chapter_read,latest_chapter,status,genres,alerts,source,url,added");
    expect(row).toBe("Naruto,Kishimoto,reading,4,698,Chapter 700.5,ongoing,Action; Fantasy,true,mangaread,https://x.test/naruto/," + NOW);
  });

  it("leaves a cell empty when there is nothing to put in it", () => {
    const [, row] = lines(toCsv([item("Naruto", { rating: null, last_chapter_read: null, preferred_source_record: null }, { author: null, latest_chapter: null, genres: null })]));
    expect(row).toBe("Naruto,,reading,,,,ongoing,,true,,," + NOW);
  });

  it("prefers the status the reader set over the site's", () => {
    const [, row] = lines(toCsv([item("Naruto", { user_status_override: "hiatus" })]));
    expect(row.split(",")[6]).toBe("hiatus");
  });

  it("quotes commas, quotes and line breaks, doubling the quotes", () => {
    const csv = toCsv([item("Hello, \"World\"\nTwo")]);
    expect(csv).toContain('"Hello, ""World""\nTwo"');
  });

  it("lists the titles A to Z whatever the case or accents", () => {
    const names = lines(toCsv([item("berserk"), item("Akira"), item("Éclair"), item("Zetman")]))
      .slice(1, -1)
      .map((l) => l.split(",")[0]);
    expect(names).toEqual(["Akira", "berserk", "Éclair", "Zetman"]);
  });

  it("does not change the order of the list it is given", () => {
    const list = [item("b"), item("a")];
    toCsv(list);
    expect(list.map((i) => i.manga.canonical_name)).toEqual(["b", "a"]);
  });

  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx"])("keeps %j from running as a formula in a spreadsheet", (title) => {
    const [, row] = lines(toCsv([item(title)]));
    expect(row.startsWith(`'${title}`)).toBe(true);
  });

  it("quotes a cell that only has a line break in it", () => {
    expect(toCsv([item("Line one\nLine two")])).toContain('"Line one\nLine two"');
  });

  it("keeps a genre from running as a formula too", () => {
    const [, row] = lines(toCsv([item("Naruto", {}, { genres: ["=1+1", "Action"] })]));
    expect(row.split(",")[7]).toBe("'=1+1; Action");
  });

  it("does not touch numbers: a rating is not text", () => {
    const [, row] = lines(toCsv([item("Naruto", { rating: 5 })]));
    expect(row.split(",")[3]).toBe("5");
  });

  it("is only a header for an empty library", () => {
    expect(lines(toCsv([]))).toEqual(["title,author,reading_status,rating,last_chapter_read,latest_chapter,status,genres,alerts,source,url,added", ""]);
  });

  it("leaves out what is not the reader's: no ids, no summary", () => {
    const csv = toCsv([item("Naruto")]);
    expect(csv).not.toContain("secret summary");
    expect(lines(csv)[0]).not.toMatch(/(^|,)(id|user_id|manga_id)(,|$)/);
  });
});

describe("JSON", () => {
  const now = new Date("2026-10-17T09:30:00Z");

  it("says what it is, when it was made and how many titles it holds", () => {
    const out = JSON.parse(toJson([item("Naruto"), item("Akira")], now));
    expect(out).toMatchObject({ app: "MangaPulse", exported_at: "2026-10-17T09:30:00.000Z", count: 2 });
  });

  it("holds a record per title, A to Z, with real types", () => {
    const out = JSON.parse(toJson([item("Naruto"), item("Akira", { rating: null, notifications_enabled: false }, { genres: null })], now));
    expect(out.titles.map((t: { title: string }) => t.title)).toEqual(["Akira", "Naruto"]);
    expect(out.titles[0]).toMatchObject({ rating: null, alerts: false, genres: [] });
    expect(out.titles[1]).toEqual({
      title: "Naruto", author: "Kishimoto", reading_status: "reading", rating: 4, last_chapter_read: "698", latest_chapter: "Chapter 700.5", status: "ongoing",
      genres: ["Action", "Fantasy"], alerts: true, source: "mangaread", url: "https://x.test/naruto/", added: NOW,
    });
  });

  it("is an empty list for an empty library", () => {
    expect(JSON.parse(toJson([], now))).toMatchObject({ count: 0, titles: [] });
  });
});

describe("the formats", () => {
  it("picks the text and the file name by format", () => {
    expect(exportText("csv", [item("a")]).startsWith("\uFEFFtitle,")).toBe(true);
    expect(JSON.parse(exportText("json", [item("a")])).count).toBe(1);
    expect(exportFileName("csv")).toBe("mangapulse-library.csv");
    expect(exportFileName("json")).toBe("mangapulse-library.json");
    expect(EXPORT_TYPES.csv.mime).toBe("text/csv");
    expect(EXPORT_TYPES.json.mime).toBe("application/json");
  });
});
