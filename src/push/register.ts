import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { devicesApi } from "@/api/endpoints";

const CHANNEL_ID = "new-chapters";
const DEVICE_ID_KEY = "mangly.device_id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Ask for permission, fetch the Expo push token and register it with the backend. Safe to call repeatedly. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS !== "android" || !Device.isDevice) return; // emulators cannot receive push

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "New chapters",
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn("Push disabled: set extra.eas.projectId (run `eas init`).");
    return;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const device = await devicesApi.register(token, Device.deviceName ?? undefined);
  await SecureStore.setItemAsync(DEVICE_ID_KEY, String(device.id));
}

export async function unregisterPush(): Promise<void> {
  const id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) return;
  await devicesApi.unregister(Number(id));
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
}
