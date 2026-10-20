import * as SecureStore from "expo-secure-store";
import type { AppNotification } from "@/api/types";

/**
 * One chapter the phone has told the user about: when MangaPulse added it (the alert's creation time on the server) and
 * when this phone showed the notification. Kept short on purpose: the store holds about 2 KB per value.
 */
export interface AlertRecord {
  /** The alert's id on the server. */
  id: number;
  title: string;
  chapter: string;
  /** When MangaPulse found the chapter and created the alert, in ms since 1970. */
  found: number;
  /** When the notification was shown on this phone, in ms since 1970. */
  sent: number;
}

/** How many are kept (the newest). */
export const MAX_HISTORY = 10;
const MAX_TITLE = 40;
const MAX_CHAPTER = 24;
const KEY = "mangly.alerts.history";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function toRecord(x: unknown): AlertRecord | null {
  if (typeof x !== "object" || x === null) return null;
  const v = x as Partial<AlertRecord>;
  if (typeof v.id !== "number" || typeof v.title !== "string" || typeof v.chapter !== "string") return null;
  if (typeof v.found !== "number" || typeof v.sent !== "number") return null;
  return { id: v.id, title: v.title, chapter: v.chapter, found: v.found, sent: v.sent };
}

/** The records for alerts that were just shown, skipping any whose creation time cannot be read. */
export function recordsFor(alerts: AppNotification[], sent: number): AlertRecord[] {
  const out: AlertRecord[] = [];
  for (const n of alerts) {
    const found = Date.parse(n.created_at);
    if (!Number.isFinite(found)) continue;
    out.push({
      id: n.id,
      title: clip(n.manga?.canonical_name ?? "A title in your library", MAX_TITLE),
      chapter: clip(n.chapter_released || "A new chapter", MAX_CHAPTER),
      found,
      sent,
    });
  }
  return out;
}

/** What was kept, oldest first; empty when nothing was, or it cannot be read. */
export async function readHistory(): Promise<AlertRecord[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.map(toRecord).filter((r): r is AlertRecord => r !== null).slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

/** Add records, keeping the newest MAX_HISTORY. An alert already recorded is not added twice. */
export async function appendHistory(records: AlertRecord[]): Promise<void> {
  if (records.length === 0) return;
  const kept = await readHistory();
  const fresh = records.filter((r) => !kept.some((k) => k.id === r.id));
  await SecureStore.setItemAsync(KEY, JSON.stringify([...kept, ...fresh].slice(-MAX_HISTORY)));
}

export async function clearHistory(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}
