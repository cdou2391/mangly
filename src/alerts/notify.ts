import * as Notifications from "expo-notifications";
import type { AlertContent } from "./plan";

export const CHANNEL_ID = "new-chapters";

// A notification that arrives while the app is open is still shown (the check itself stays quiet while the app is open).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "New chapters",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function hasPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Ask the system for permission (Android 13+ shows a prompt, earlier versions grant it). */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** What tapping a notification opens. */
export const OPEN_UPDATES = { screen: "updates" } as const;

export async function show(contents: AlertContent[]): Promise<void> {
  await ensureChannel();
  for (const c of contents) {
    await Notifications.scheduleNotificationAsync({
      identifier: c.identifier,
      content: { title: c.title, body: c.body, data: c.data ?? { ...OPEN_UPDATES } },
      trigger: { channelId: CHANNEL_ID },
    });
  }
}

export async function dismissAll(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}
