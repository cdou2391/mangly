import { AppState } from "react-native";
import { notificationsApi } from "@/api/endpoints";
import { restoreSession } from "@/api/client";
import { appendHistory, recordsFor } from "./history";
import { hasPermission, show } from "./notify";
import { alertContents, delayMinutes, newAlerts, newestId } from "./plan";
import { unregisterAlertsTask } from "./registration";
import { MAX_DELAYS, patchState, readState, type CheckOutcome } from "./state";

export type CheckResult = "notified" | "baseline" | "nothing" | "skipped" | "signed-out" | "unreachable" | "failed";

/** Remember how this check went, for the status line in Settings. Never allowed to fail the check itself. */
const note = (result: CheckOutcome) => patchState({ lastCheck: { at: Date.now(), result, shown: 0 } }).catch(() => {});

/**
 * One background check for new chapters: renew the session, read the unread alerts, and show a notification for each
 * one newer than the last the user has seen. Runs from the system's background scheduler, possibly in a fresh JS
 * context with nothing in memory, so everything it needs comes from storage.
 */
export async function runAlertsCheck(): Promise<CheckResult> {
  const state = await readState();
  if (!state.enabled || state.userId === null) return "skipped";
  // In the app the user already sees their alerts; the app keeps `seenId` up to date itself.
  if (AppState.currentState === "active") return "skipped";

  const session = await restoreSession();
  if (session === "none" || session === "rejected") {
    await unregisterAlertsTask(); // nobody to check for; signing in again schedules it again
    return "signed-out";
  }
  if (session === "unreachable") {
    await note("unreachable");
    return "unreachable";
  }

  let unread;
  try {
    unread = await notificationsApi.list({ unreadOnly: true });
  } catch {
    await note("unreachable");
    return "unreachable";
  }

  // Never been here: what is unread now is the backlog, not news. Remember where it ends and tell the user about what comes after.
  if (state.seenId === null) {
    await patchState({ seenId: newestId(unread), lastCheck: { at: Date.now(), result: "baseline", shown: 0 } });
    return "baseline";
  }

  const fresh = newAlerts(unread, state.seenId);
  if (fresh.length === 0) {
    await note("nothing");
    return "nothing";
  }

  let shown = 0;
  try {
    // Without permission there is nothing to show, and what was missed is not replayed later as a burst.
    if (await hasPermission()) {
      const contents = alertContents(fresh);
      await show(contents);
      shown = contents.length;
    }
  } catch {
    await note("failed");
    return "failed"; // not marked as seen, so the next run tries again
  }
  const now = Date.now();
  // How late each alert was, to tell whether the delay matters. Only for alerts that were really shown.
  const late = shown > 0 ? fresh.map((n) => delayMinutes(n, now)).filter((m): m is number => m !== null) : [];
  // Remembered for the alert history in Settings; never allowed to fail the check.
  if (shown > 0) await appendHistory(recordsFor(fresh, now)).catch(() => {});
  await patchState({
    seenId: newestId(fresh), // every one of them is newer than `seenId`
    lastCheck: { at: now, result: shown > 0 ? "notified" : "no-permission", shown },
    delays: [...state.delays, ...late].slice(-MAX_DELAYS),
  });
  return "notified";
}
