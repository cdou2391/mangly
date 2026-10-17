import type { AppNotification } from "@/api/types";
import { shortChapter } from "@/utils/chapters";

/** Up to this many new chapters get a notification each; more than that are folded into one. */
export const MAX_SEPARATE = 3;

export interface AlertContent {
  identifier: string;
  title: string;
  body: string;
  /** What the notification carries for when it is tapped. Always names the screen; one for a single chapter also says which. */
  data?: Record<string, unknown>;
}

/** The highest alert id in the list (0 when empty): everything up to it has been seen or notified. */
export const newestId = (list: AppNotification[]) => list.reduce((max, n) => Math.max(max, n.id), 0);

/**
 * The alerts to tell the user about: unread ones newer than the last one already dealt with, oldest first. With no
 * baseline yet (`seenId` null) there is nothing to tell: the existing backlog is not news, so it only sets the baseline.
 */
export function newAlerts(list: AppNotification[], seenId: number | null): AppNotification[] {
  if (seenId === null) return [];
  return list.filter((n) => !n.is_read && n.id > seenId).sort((a, b) => a.id - b.id);
}

const title = (n: AppNotification) => n.manga?.canonical_name ?? "A title in your library";

/** What to show for a set of new alerts: one notification each, or a single summary when there are many. */
export function alertContents(alerts: AppNotification[]): AlertContent[] {
  if (alerts.length === 0) return [];
  if (alerts.length <= MAX_SEPARATE) {
    return alerts.map((n) => ({
      identifier: `alert-${n.id}`,
      title: title(n),
      body: `${shortChapter(n.chapter_released) ?? "A new chapter"} is out`,
      data: { screen: "updates", alertId: n.id, mangaId: n.manga_id, chapter: n.chapter_released, chapterUrl: n.latest_chapter_url },
    }));
  }
  const names = [...new Set(alerts.map(title))];
  const shown = names.slice(0, MAX_SEPARATE).join(", ");
  const more = names.length > MAX_SEPARATE ? ` and ${names.length - MAX_SEPARATE} more` : "";
  return [{ identifier: "alerts-summary", title: `${alerts.length} new chapters`, body: `${shown}${more}`, data: { screen: "updates" } }];
}

/** What tapping a notification for one chapter should open. */
export interface TapTarget {
  notification_id: number;
  manga_id: number;
  chapter: string;
  chapter_url: string | null;
}

/**
 * The chapter a tapped notification is about, or null when it is a summary (or anything unexpected), which just opens
 * Updates. Reads the data defensively: it comes back from the system, possibly from an older version of the app. A link
 * that is not http(s) is dropped, so the chapter's title page opens instead.
 */
export function tapTarget(data: unknown): TapTarget | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.alertId !== "number" || typeof d.mangaId !== "number" || typeof d.chapter !== "string" || !d.chapter) return null;
  const url = typeof d.chapterUrl === "string" && /^https?:\/\//i.test(d.chapterUrl) ? d.chapterUrl : null;
  return { notification_id: d.alertId, manga_id: d.mangaId, chapter: d.chapter, chapter_url: url };
}

/** Minutes between the server creating an alert and now (never negative), or null when its time is unreadable. */
export function delayMinutes(n: AppNotification, now: number): number | null {
  const created = Date.parse(n.created_at);
  return Number.isFinite(created) ? Math.max(0, Math.round((now - created) / 60_000)) : null;
}
