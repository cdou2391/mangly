import { AppState } from "react-native";
import { restoreSession } from "@/api/client";
import { notificationsApi } from "@/api/endpoints";
import type { AppNotification } from "@/api/types";
import { runAlertsCheck } from "../check";
import { hasPermission, show } from "../notify";
import { unregisterAlertsTask } from "../registration";
import { readState, writeState } from "../state";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("@/api/client", () => ({ restoreSession: jest.fn() }));
jest.mock("@/api/endpoints", () => ({ notificationsApi: { list: jest.fn() } }));
jest.mock("../notify", () => ({ hasPermission: jest.fn(), show: jest.fn() }));
jest.mock("../registration", () => ({ unregisterAlertsTask: jest.fn(async () => {}) }));

const restore = restoreSession as jest.Mock;
const list = notificationsApi.list as jest.Mock;
const permitted = hasPermission as jest.Mock;
const present = show as jest.Mock;
const unregister = unregisterAlertsTask as jest.Mock;

const alert = (id: number, title = "Chainsaw Man", chapter = "191", read = false) =>
  ({ id, is_read: read, chapter_released: chapter, manga: { canonical_name: title } }) as AppNotification;

const setState = (s: Partial<{ enabled: boolean | null; userId: number | null; seenId: number | null }> = {}) =>
  writeState({ enabled: true, userId: 1, seenId: 10, ...s });

beforeEach(() => {
  jest.clearAllMocks();
  const { store } = require("@/test-utils/mocks");
  Object.keys(store).forEach((k) => delete store[k]);
  restore.mockResolvedValue("ok");
  permitted.mockResolvedValue(true);
  list.mockResolvedValue([]);
  (AppState as { currentState: string }).currentState = "background";
});

describe("when it does nothing", () => {
  it("is off until the user has said yes", async () => {
    await setState({ enabled: null });
    expect(await runAlertsCheck()).toBe("skipped");
    await setState({ enabled: false });
    expect(await runAlertsCheck()).toBe("skipped");
    expect(restore).not.toHaveBeenCalled();
  });

  it("has nobody to check for when no user is attached", async () => {
    await setState({ userId: null });
    expect(await runAlertsCheck()).toBe("skipped");
    expect(restore).not.toHaveBeenCalled();
  });

  it("stays out of the way while the app is open", async () => {
    await setState();
    (AppState as { currentState: string }).currentState = "active";
    expect(await runAlertsCheck()).toBe("skipped");
    expect(restore).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("does nothing when there is no new alert", async () => {
    await setState();
    list.mockResolvedValue([alert(10), alert(4)]);
    expect(await runAlertsCheck()).toBe("nothing");
    expect(present).not.toHaveBeenCalled();
  });
});

describe("the session", () => {
  beforeEach(() => setState());

  it.each(["none", "rejected"])("stops checking when the session is gone (%s)", async (outcome) => {
    restore.mockResolvedValue(outcome);
    expect(await runAlertsCheck()).toBe("signed-out");
    expect(unregister).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("tries again next time when the server cannot be reached, and keeps the schedule", async () => {
    restore.mockResolvedValue("unreachable");
    expect(await runAlertsCheck()).toBe("unreachable");
    expect(unregister).not.toHaveBeenCalled();
  });

  it("tries again next time when the alerts cannot be read", async () => {
    list.mockRejectedValue(new Error("offline"));
    expect(await runAlertsCheck()).toBe("unreachable");
    expect((await readState()).seenId).toBe(10);
  });
});

describe("new alerts", () => {
  it("asks only for unread alerts", async () => {
    await setState();
    await runAlertsCheck();
    expect(list).toHaveBeenCalledWith({ unreadOnly: true });
  });

  it("shows one notification per new chapter and remembers the newest", async () => {
    await setState();
    list.mockResolvedValue([alert(12, "Dandadan", "164"), alert(11), alert(10, "Old", "1")]);
    expect(await runAlertsCheck()).toBe("notified");
    expect(present).toHaveBeenCalledTimes(1);
    expect(present.mock.calls[0][0].map((c: { identifier: string }) => c.identifier)).toEqual(["alert-11", "alert-12"]);
    expect((await readState()).seenId).toBe(12);
  });

  it("does not tell the same chapter twice", async () => {
    await setState();
    list.mockResolvedValue([alert(11)]);
    await runAlertsCheck();
    await runAlertsCheck();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it("does not move the baseline back when an older alert is the newest unread one", async () => {
    await setState({ seenId: 20 });
    list.mockResolvedValue([alert(12)]);
    expect(await runAlertsCheck()).toBe("nothing");
    expect((await readState()).seenId).toBe(20);
  });

  it("tries again next time when showing the notification fails", async () => {
    await setState();
    list.mockResolvedValue([alert(11)]);
    present.mockRejectedValueOnce(new Error("no channel"));
    expect(await runAlertsCheck()).toBe("failed");
    expect((await readState()).seenId).toBe(10);
    expect(await runAlertsCheck()).toBe("notified");
  });

  it("without permission shows nothing, and does not replay the missed ones later as a burst", async () => {
    await setState();
    permitted.mockResolvedValue(false);
    list.mockResolvedValue([alert(11)]);
    await runAlertsCheck();
    expect(present).not.toHaveBeenCalled();
    expect((await readState()).seenId).toBe(11);
  });
});

describe("the first run", () => {
  it("takes the unread backlog as the baseline and does not notify about it", async () => {
    await setState({ seenId: null });
    list.mockResolvedValue([alert(30), alert(25)]);
    expect(await runAlertsCheck()).toBe("baseline");
    expect(present).not.toHaveBeenCalled();
    expect((await readState()).seenId).toBe(30);
  });

  it("with nothing unread, sets the baseline to 0 so the next alert is news", async () => {
    await setState({ seenId: null });
    expect(await runAlertsCheck()).toBe("baseline");
    expect((await readState()).seenId).toBe(0);
    list.mockResolvedValue([alert(1)]);
    expect(await runAlertsCheck()).toBe("notified");
  });
});
