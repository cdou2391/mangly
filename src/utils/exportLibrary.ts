import type { TrackedManga } from "@/api/types";

export type ExportFormat = "csv" | "json";

export const EXPORT_TYPES: Record<ExportFormat, { mime: string; label: string }> = {
  csv: { mime: "text/csv", label: "CSV" },
  json: { mime: "application/json", label: "JSON" },
};

/** What is exported for each title: the reader's own data, plus enough to find the title again. No ids of the server. */
const COLUMNS = [
  "title",
  "author",
  "reading_status",
  "rating",
  "last_chapter_read",
  "latest_chapter",
  "status",
  "genres",
  "alerts",
  "source",
  "url",
  "added",
] as const;

type Row = Record<(typeof COLUMNS)[number], string | number | boolean | string[] | null>;

const byTitle = (a: TrackedManga, b: TrackedManga) => a.manga.canonical_name.localeCompare(b.manga.canonical_name, undefined, { sensitivity: "base" });

function toRow(t: TrackedManga): Row {
  return {
    title: t.manga.canonical_name,
    author: t.manga.author,
    reading_status: t.reading_status,
    rating: t.rating,
    last_chapter_read: t.last_chapter_read,
    latest_chapter: t.manga.latest_chapter,
    status: t.user_status_override ?? t.manga.global_status,
    genres: t.manga.genres ?? [],
    alerts: t.notifications_enabled,
    source: t.preferred_source_record?.source ?? null,
    url: t.preferred_source_record?.manga_details_url ?? null,
    added: t.created_at,
  };
}

/**
 * A text cell, quoted when it has to be. Titles come from scraped websites, so a cell that starts like a spreadsheet formula
 * ("=", "+", "-", "@") gets a leading apostrophe: opened in Excel or Sheets it stays text instead of running.
 */
function cell(value: Row[keyof Row]): string {
  if (value === null || value === undefined) return "";
  let text = Array.isArray(value) ? value.join("; ") : String(value);
  if (typeof value !== "number" && typeof value !== "boolean" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The library as CSV: a header row, then one row per title, A to Z. Starts with a byte-order mark so Excel reads the accents. */
export function toCsv(items: TrackedManga[]): string {
  const lines = [COLUMNS.join(","), ...[...items].sort(byTitle).map((t) => COLUMNS.map((c) => cell(toRow(t)[c])).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** The library as JSON, A to Z, with when it was exported. */
export function toJson(items: TrackedManga[], now = new Date()): string {
  const titles = [...items].sort(byTitle).map(toRow);
  return JSON.stringify({ app: "MangaPulse", exported_at: now.toISOString(), count: titles.length, titles }, null, 2);
}

export const exportText = (format: ExportFormat, items: TrackedManga[], now = new Date()) => (format === "csv" ? toCsv(items) : toJson(items, now));

/** "mangapulse-library.csv": the same name every time, so an export replaces the last one instead of piling up. */
export const exportFileName = (format: ExportFormat) => `mangapulse-library.${format}`;
