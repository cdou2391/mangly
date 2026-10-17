import * as Notifications from "expo-notifications";
import { CHANNEL_ID, OPEN_UPDATES, dismissAll, ensureChannel, hasPermission, requestPermission, show } from "../notify";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  dismissAllNotificationsAsync: jest.fn(async () => {}),
}));

const N = Notifications as jest.Mocked<typeof Notifications>;
const perms = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain }) as never;

beforeEach(() => jest.clearAllMocks());

describe("permission", () => {
  it("reads whether notifications are allowed", async () => {
    N.getPermissionsAsync.mockResolvedValue(perms(true));
    expect(await hasPermission()).toBe(true);
    N.getPermissionsAsync.mockResolvedValue(perms(false));
    expect(await hasPermission()).toBe(false);
  });

  it("does not ask again when already allowed", async () => {
    N.getPermissionsAsync.mockResolvedValue(perms(true));
    expect(await requestPermission()).toBe(true);
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks the system when it can, and returns the answer", async () => {
    N.getPermissionsAsync.mockResolvedValue(perms(false, true));
    N.requestPermissionsAsync.mockResolvedValue(perms(true));
    expect(await requestPermission()).toBe(true);
    N.requestPermissionsAsync.mockResolvedValue(perms(false));
    expect(await requestPermission()).toBe(false);
  });

  it("does not show a prompt that the system will not show", async () => {
    N.getPermissionsAsync.mockResolvedValue(perms(false, false));
    expect(await requestPermission()).toBe(false);
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("showing", () => {
  it("makes the channel first, then posts each one at once on that channel, opening Updates when tapped", async () => {
    await show([
      { identifier: "alert-1", title: "Chainsaw Man", body: "Ch. 191 is out" },
      { identifier: "alert-2", title: "Dandadan", body: "Ch. 164 is out" },
    ]);
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith(CHANNEL_ID, expect.objectContaining({ name: "New chapters" }));
    expect(N.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(N.scheduleNotificationAsync.mock.invocationCallOrder[0]);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "alert-1",
      content: { title: "Chainsaw Man", body: "Ch. 191 is out", data: { ...OPEN_UPDATES } },
      trigger: { channelId: CHANNEL_ID },
    });
  });

  it("carries what a notification says about itself, so a tap knows what to open", async () => {
    const data = { screen: "updates", alertId: 5, mangaId: 50, chapter: "191", chapterUrl: "https://x.test/191" };
    await show([{ identifier: "alert-5", title: "Chainsaw Man", body: "Ch. 191 is out", data }]);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ data }) }));
  });

  it("creates the channel", async () => {
    await ensureChannel();
    expect(N.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
  });

  it("clears notifications, and does not mind if that fails", async () => {
    await dismissAll();
    expect(N.dismissAllNotificationsAsync).toHaveBeenCalled();
    N.dismissAllNotificationsAsync.mockRejectedValueOnce(new Error("x"));
    await expect(dismissAll()).resolves.toBeUndefined();
  });
});
