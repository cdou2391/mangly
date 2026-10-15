import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const ALERTS_TASK = "mangly-check-new-chapters";
/** Android treats this as a minimum (and never runs a task more often than every 15 minutes); the real gap is up to the system. */
export const CHECK_EVERY_MINUTES = 15;

/** Start the periodic check. Does nothing if it is already scheduled: registering again would reset the pending run. */
export async function registerAlertsTask(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (await TaskManager.isTaskRegisteredAsync(ALERTS_TASK)) return;
  await BackgroundTask.registerTaskAsync(ALERTS_TASK, { minimumInterval: CHECK_EVERY_MINUTES });
}

export async function unregisterAlertsTask(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (await TaskManager.isTaskRegisteredAsync(ALERTS_TASK)) await BackgroundTask.unregisterTaskAsync(ALERTS_TASK);
}
