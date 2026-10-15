import { AppState } from "react-native";
import { notificationsApi } from "@/api/endpoints";
import { restoreSession } from "@/api/client";
import { hasPermission, show } from "./notify";
import { alertContents, newAlerts, newestId } from "./plan";
import { unregisterAlertsTask } from "./registration";
import { patchState, readState } from "./state";

export type CheckResult = "notified" | "baseline" | "nothing" | "skipped" | "signed-out" | "unreachable" | "failed";

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
  if (session === "unreachable") return "unreachable";

  let unread;
  try {
    unread = await notificationsApi.list({ unreadOnly: true });
  } catch {
    return "unreachable";
  }

  // Never been here: what is unread now is the backlog, not news. Remember where it ends and tell the user about what comes after.
  if (state.seenId === null) {
    await patchState({ seenId: newestId(unread) });
    return "baseline";
  }

  const fresh = newAlerts(unread, state.seenId);
  if (fresh.length === 0) return "nothing";

  try {
    // Without permission there is nothing to show, and what was missed is not replayed later as a burst.
    if (await hasPermission()) await show(alertContents(fresh));
  } catch {
    return "failed"; // not marked as seen, so the next run tries again
  }
  await patchState({ seenId: newestId(fresh) }); // every one of them is newer than `seenId`
  return "notified";
}
