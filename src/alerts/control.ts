import { OPEN_UPDATES, dismissAll, hasPermission, requestPermission, show } from "./notify";
import { registerAlertsTask, unregisterAlertsTask } from "./registration";
import { clearState, EMPTY, patchState, readState, type AlertsState } from "./state";

/**
 * Make the stored state belong to this user. A different person on the same device starts from scratch (not asked yet,
 * no baseline), so nobody is notified about, or by, someone else's alerts.
 */
export async function attachUser(userId: number): Promise<AlertsState> {
  const state = await readState();
  if (state.userId === userId) return state;
  const next = { ...EMPTY, userId };
  await patchState(next);
  return next;
}

/** The newest alert the app itself has shown, so a later background check does not announce it again. Never moves backwards. */
export async function markSeen(userId: number, id: number): Promise<void> {
  const state = await readState();
  if (state.userId !== userId) return;
  if (state.seenId !== null && state.seenId >= id) return;
  await patchState({ seenId: id });
}

/** Whether alerts are on for this device: chosen by the user, and the system lets us show them. */
export async function isOn(): Promise<boolean> {
  const state = await readState();
  return state.enabled === true && (await hasPermission());
}

/**
 * Turn alerts on: ask the system for permission if needed, then schedule the background check. "denied" means the
 * system would not allow notifications (the user can still change that in the system settings).
 */
export async function turnOn(): Promise<"on" | "denied"> {
  if (!(await requestPermission())) {
    await patchState({ enabled: false });
    return "denied";
  }
  await patchState({ enabled: true });
  await registerAlertsTask();
  return "on";
}

export async function turnOff(): Promise<void> {
  await patchState({ enabled: false });
  await unregisterAlertsTask();
}

/** Keep the schedule in step with the saved choice (the app can be restarted, updated or restored with the task gone). */
export async function resume(): Promise<void> {
  if (await isOn()) await registerAlertsTask();
}

/** Shows a notification like a real one, so the user can see that they work. "no-permission": the system is blocking them. */
export async function sendTestNotification(): Promise<"sent" | "no-permission"> {
  if (!(await hasPermission())) return "no-permission";
  await show([{ identifier: "alerts-test", title: "MangaPulse", body: "Notifications are working. New chapters will show up like this.", data: { ...OPEN_UPDATES } }]);
  return "sent";
}

/** On sign-out: no background checks, nothing remembered, and no notification left over from this account. */
export async function stopAlerts(): Promise<void> {
  await unregisterAlertsTask().catch(() => {});
  await clearState();
  await dismissAll();
}
