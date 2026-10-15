import { BackgroundTaskResult } from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { runAlertsCheck } from "./check";
import { ALERTS_TASK } from "./registration";

/**
 * The background task has to be defined when the JS bundle loads, not when a screen renders, because the system starts
 * the app headless to run it. `index.ts` (the app's entry point) imports this file for that reason.
 */
TaskManager.defineTask(ALERTS_TASK, async () => {
  try {
    await runAlertsCheck();
    return BackgroundTaskResult.Success;
  } catch (e) {
    console.warn("Checking for new chapters failed", e);
    return BackgroundTaskResult.Failed;
  }
});
