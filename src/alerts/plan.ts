import type { AppNotification } from "@/api/types";
import { shortChapter } from "@/utils/chapters";

/** Up to this many new chapters get a notification each; more than that are folded into one. */
export const MAX_SEPARATE = 3;

export interface AlertContent {
  identifier: string;
  title: string;
  body: string;
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
    }));
  }
  const names = [...new Set(alerts.map(title))];
  const shown = names.slice(0, MAX_SEPARATE).join(", ");
  const more = names.length > MAX_SEPARATE ? ` and ${names.length - MAX_SEPARATE} more` : "";
  return [{ identifier: "alerts-summary", title: `${alerts.length} new chapters`, body: `${shown}${more}` }];
}
