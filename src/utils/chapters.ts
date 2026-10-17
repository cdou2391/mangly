// Chapter labels come from scraped sites, so they are free text: "188", "Chapter 188.5", "Vol.3 Chapter 12 - Title 2".

const KEYWORDED = /(?:chapter|ch\.?|episode|ep\.?)\s*(\d+(?:\.\d+)?)/i;
const ANY_NUMBER = /(\d+(?:\.\d+)?)/;

/** The chapter number in a label, or null if there isn't one. Prefers a number that follows "Chapter"/"Ch."/"Episode". */
export function parseChapter(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = label.match(KEYWORDED) ?? label.match(ANY_NUMBER);
  return m ? Number(m[1]) : null;
}

/** Compact label for a list: "Chapter 188" -> "Ch. 188", "188" -> "Ch. 188", other text is kept as is. */
export function shortChapter(label: string | null | undefined): string | null {
  const text = label?.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return `Ch. ${text}`;
  return text.replace(/^chapter\s*/i, "Ch. ");
}

/**
 * How many chapters the reader is behind. Null when it cannot be told (nothing read yet, or a label without
 * a number), so callers can show "not started" instead of a misleading "+1130".
 */
export function unreadChapters(read: string | null | undefined, latest: string | null | undefined): number | null {
  const r = parseChapter(read);
  const l = parseChapter(latest);
  if (r === null || l === null) return null;
  return Math.max(0, Math.floor(l) - Math.floor(r));
}

/** Reading progress from 0 to 1, or null when it cannot be told. */
export function readProgress(read: string | null | undefined, latest: string | null | undefined): number | null {
  const r = parseChapter(read);
  const l = parseChapter(latest);
  if (r === null || l === null || l <= 0) return null;
  return Math.min(1, Math.max(0, r / l));
}

/**
 * The value to save as "last chapter read" for a chapter label. Saves the bare number the way the web app does
 * ("Chapter 191" -> "191"), which is what the server compares; keeps the label as is when it has no number
 * ("Oneshot", "Prologue"), which the server treats as chapter 0.
 */
export function chapterToStore(label: string): string {
  const n = parseChapter(label);
  return n === null ? label.trim() : String(n);
}

/** Highest chapter number the progress editor accepts; far above any real series, it only stops a typo from being saved. */
export const MAX_CHAPTER = 99999;

/** A chapter number typed by the reader ("188", "188.5", "188,5"), or null when it is not one. */
export function parseDraft(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_CHAPTER ? n : null;
}

/** A chapter number as text, without float noise: 188 -> "188", 188.5 -> "188.5". */
export const formatChapter = (n: number): string => String(Math.round(n * 100) / 100);

/** One chapter up or down from what is typed. Starts from 0 when the field is empty or not a number, and never goes below 0 or above MAX_CHAPTER. */
export function stepChapter(text: string, by: 1 | -1): string {
  const n = parseDraft(text) ?? 0;
  return formatChapter(Math.min(MAX_CHAPTER, Math.max(0, n + by)));
}

/**
 * The chapter number written in a chapter link ("…/chapter-188/", "…/chapter-188-5/"), or null when the link does not say
 * (some sites link by an id). Used to notice a saved link that no longer belongs to the chapter the reader says they are on.
 */
export function urlChapter(url: string | null | undefined): number | null {
  const m = url?.match(/(?:chapter|ch|episode|ep)[-_/]?(\d+(?:[.-]\d+)?)/i);
  return m ? Number(m[1].replace("-", ".")) : null;
}
