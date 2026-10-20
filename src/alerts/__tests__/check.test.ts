import { AppState } from "react-native";
import { restoreSession } from "@/api/client";
import { notificationsApi } from "@/api/endpoints";
import type { AppNotification } from "@/api/types";
import { runAlertsCheck } from "../check";
import { readHistory } from "../history";
import { hasPermission, show } from "../notify";
import { unregisterAlertsTask } from "../registration";
import { EMPTY, readState, writeState, type AlertsState } from "../state";

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

const alert = (id: number, title = "Chainsaw Man", chapter = "191", read = false, createdAt = "2026-10-17T11:30:00Z") =>
  ({ id, is_read: read, chapter_released: chapter, created_at: createdAt, manga: { canonical_name: title } }) as AppNotification;

const setState = (s: Partial<AlertsState> = {}) =>
  writeState({ ...EMPTY, enabled: true, userId: 1, seenId: 10, ...s });

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

describe("remembering how it went, for the status line in Settings", () => {
  const NOW = Date.parse("2026-10-17T12:00:00Z");
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "queueMicrotask"] });
  });
  afterEach(() => jest.useRealTimers());

  it("notes a check with nothing new", async () => {
    await setState();
    list.mockResolvedValue([alert(10)]);
    await runAlertsCheck();
    expect((await readState()).lastCheck).toEqual({ at: NOW, result: "nothing", shown: 0 });
  });

  it("notes the baseline, and keeps no delay for an alert it did not announce", async () => {
    await setState({ seenId: null });
    list.mockResolvedValue([alert(5)]);
    await runAlertsCheck();
    const state = await readState();
    expect(state.lastCheck).toEqual({ at: NOW, result: "baseline", shown: 0 });
    expect(state.delays).toEqual([]);
  });

  it("notes the notifications shown (a summary counts as one), and how late each alert was", async () => {
    await setState();
    list.mockResolvedValue([alert(11, "A", "1", false, "2026-10-17T11:30:00Z"), alert(12, "B", "2", false, "2026-10-17T10:00:00Z")]);
    await runAlertsCheck();
    const state = await readState();
    expect(state.lastCheck).toEqual({ at: NOW, result: "notified", shown: 2 });
    expect(state.delays).toEqual([30, 120]);

    await setState({ seenId: 12 });
    list.mockResolvedValue([13, 14, 15, 16].map((i) => alert(i, `T${i}`, `${i}`)));
    await runAlertsCheck();
    expect((await readState()).lastCheck).toEqual({ at: NOW, result: "notified", shown: 1 });
  });

  it("keeps when each alert was created and when it was shown, for the history in Settings", async () => {
    await setState();
    list.mockResolvedValue([alert(11, "A", "1", false, "2026-10-17T11:30:00Z"), alert(12, "B", "2", false, "2026-10-17T10:00:00Z")]);
    await runAlertsCheck();
    expect(await readHistory()).toEqual([
      { id: 11, title: "A", chapter: "1", found: Date.parse("2026-10-17T11:30:00Z"), sent: NOW },
      { id: 12, title: "B", chapter: "2", found: Date.parse("2026-10-17T10:00:00Z"), sent: NOW },
    ]);
  });

  it("lists each chapter, not the one summary notification, when many arrive at once", async () => {
    await setState();
    list.mockResolvedValue([11, 12, 13, 14, 15].map((i) => alert(i, `T${i}`, `${i}`)));
    await runAlertsCheck();
    expect((await readHistory()).map((r) => r.id)).toEqual([11, 12, 13, 14, 15]);
  });

  it("keeps nothing for alerts that were not shown (blocked, failed, baseline, nothing new)", async () => {
    await setState();
    permitted.mockResolvedValue(false);
    list.mockResolvedValue([alert(11)]);
    await runAlertsCheck();
    await setState();
    permitted.mockResolvedValue(true);
    present.mockRejectedValueOnce(new Error("no channel"));
    await runAlertsCheck();
    await setState({ seenId: null });
    await runAlertsCheck();
    await setState({ seenId: 11 });
    await runAlertsCheck();
    expect(await readHistory()).toEqual([]);
  });

  it("still finishes the check when the history cannot be saved", async () => {
    await setState();
    list.mockResolvedValue([alert(11)]);
    const secure = require("expo-secure-store");
    const mem = require("@/test-utils/mocks").store;
    const original = secure.setItemAsync.getMockImplementation();
    secure.setItemAsync.mockImplementation(async (k: string, v: string) => {
      if (k === "mangly.alerts.history") throw new Error("disk full");
      mem[k] = v;
    });
    try {
      expect(await runAlertsCheck()).toBe("notified");
    } finally {
      secure.setItemAsync.mockImplementation(original);
    }
    expect((await readState()).seenId).toBe(11);
  });

  it("adds to the delays already kept, and keeps only the latest twenty", async () => {
    await setState({ delays: Array.from({ length: 19 }, (_, i) => i + 100) });
    list.mockResolvedValue([alert(11), alert(12)]);
    await runAlertsCheck();
    const { delays } = await readState();
    expect(delays).toHaveLength(20);
    expect(delays.slice(-2)).toEqual([30, 30]);
    expect(delays[0]).toBe(101);
  });

  it("never saves more than twenty delays, so the saved state does not grow", async () => {
    await setState({ delays: Array.from({ length: 19 }, (_, i) => i) });
    list.mockResolvedValue([alert(11), alert(12), alert(13)]);
    await runAlertsCheck();
    const { store } = require("@/test-utils/mocks");
    expect(JSON.parse(store["mangly.alerts"]).delays).toHaveLength(20);
  });

  it("does not count an alert whose time cannot be read", async () => {
    await setState();
    list.mockResolvedValue([alert(11, "A", "1", false, "later")]);
    await runAlertsCheck();
    const state = await readState();
    expect(state.lastCheck?.result).toBe("notified");
    expect(state.delays).toEqual([]);
  });

  it("notes blocked notifications, and keeps no delay: nothing was shown", async () => {
    await setState();
    permitted.mockResolvedValue(false);
    list.mockResolvedValue([alert(11)]);
    await runAlertsCheck();
    const state = await readState();
    expect(state.lastCheck).toEqual({ at: NOW, result: "no-permission", shown: 0 });
    expect(state.delays).toEqual([]);
    expect(state.seenId).toBe(11);
  });

  it("notes a failure to show, and does not move the baseline", async () => {
    await setState();
    list.mockResolvedValue([alert(11)]);
    present.mockRejectedValueOnce(new Error("no channel"));
    await runAlertsCheck();
    const state = await readState();
    expect(state.lastCheck).toEqual({ at: NOW, result: "failed", shown: 0 });
    expect(state.seenId).toBe(10);
    expect(state.delays).toEqual([]);
  });

  it("notes that the server could not be reached, whether the session or the alerts failed", async () => {
    await setState();
    restore.mockResolvedValue("unreachable");
    await runAlertsCheck();
    expect((await readState()).lastCheck?.result).toBe("unreachable");
    restore.mockResolvedValue("ok");
    list.mockRejectedValue(new Error("offline"));
    await runAlertsCheck();
    expect((await readState()).lastCheck).toEqual({ at: NOW, result: "unreachable", shown: 0 });
  });

  it("notes nothing when the check was skipped, so Settings never claims a check that did not look", async () => {
    await setState({ enabled: false });
    await runAlertsCheck();
    expect((await readState()).lastCheck).toBeNull();
    await setState();
    (AppState as { currentState: string }).currentState = "active";
    await runAlertsCheck();
    expect((await readState()).lastCheck).toBeNull();
  });

  it("notes nothing when signed out: there is no one to tell", async () => {
    await setState();
    restore.mockResolvedValue("none");
    await runAlertsCheck();
    expect((await readState()).lastCheck).toBeNull();
  });

  it("still finishes the check when the status cannot be saved", async () => {
    await setState();
    list.mockResolvedValue([alert(10)]);
    const store = require("expo-secure-store");
    store.setItemAsync.mockRejectedValueOnce(new Error("disk full"));
    expect(await runAlertsCheck()).toBe("nothing");
  });
});
