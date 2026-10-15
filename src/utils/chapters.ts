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
