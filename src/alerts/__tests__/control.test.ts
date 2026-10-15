import { attachUser, isOn, markSeen, resume, stopAlerts, turnOff, turnOn } from "../control";
import { dismissAll, hasPermission, requestPermission } from "../notify";
import { registerAlertsTask, unregisterAlertsTask } from "../registration";
import { readState, writeState } from "../state";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("../notify", () => ({ dismissAll: jest.fn(async () => {}), hasPermission: jest.fn(), requestPermission: jest.fn() }));
jest.mock("../registration", () => ({ registerAlertsTask: jest.fn(async () => {}), unregisterAlertsTask: jest.fn(async () => {}) }));

const permitted = hasPermission as jest.Mock;
const ask = requestPermission as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  const { store } = require("@/test-utils/mocks");
  Object.keys(store).forEach((k) => delete store[k]);
  permitted.mockResolvedValue(true);
  ask.mockResolvedValue(true);
});

describe("attachUser", () => {
  it("starts a new user from scratch: not asked, no baseline", async () => {
    expect(await attachUser(7)).toEqual({ enabled: null, userId: 7, seenId: null });
  });

  it("keeps what is saved for the same user", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    expect(await attachUser(7)).toEqual({ enabled: true, userId: 7, seenId: 40 });
  });

  it("does not hand one person's choice and baseline to the next person on the device", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    expect(await attachUser(8)).toEqual({ enabled: null, userId: 8, seenId: null });
    expect(await readState()).toEqual({ enabled: null, userId: 8, seenId: null });
  });
});

describe("markSeen", () => {
  it("moves the baseline forward for this user", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    await markSeen(7, 55);
    expect((await readState()).seenId).toBe(55);
  });

  it("never moves it back", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    await markSeen(7, 30);
    expect((await readState()).seenId).toBe(40);
  });

  it("sets the first baseline", async () => {
    await writeState({ enabled: true, userId: 7, seenId: null });
    await markSeen(7, 12);
    expect((await readState()).seenId).toBe(12);
  });

  it("ignores someone else's alerts", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    await markSeen(8, 99);
    expect((await readState()).seenId).toBe(40);
  });
});

describe("turning on and off", () => {
  it("on: asks for permission, remembers the choice, and schedules the check", async () => {
    await attachUser(7);
    expect(await turnOn()).toBe("on");
    expect((await readState()).enabled).toBe(true);
    expect(registerAlertsTask).toHaveBeenCalled();
  });

  it("on, but the system says no: stays off and schedules nothing", async () => {
    ask.mockResolvedValue(false);
    await attachUser(7);
    expect(await turnOn()).toBe("denied");
    expect((await readState()).enabled).toBe(false);
    expect(registerAlertsTask).not.toHaveBeenCalled();
  });

  it("off: remembers the choice and cancels the check", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 1 });
    await turnOff();
    expect((await readState()).enabled).toBe(false);
    expect(unregisterAlertsTask).toHaveBeenCalled();
  });

  it("is on only when chosen and still permitted by the system", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 1 });
    expect(await isOn()).toBe(true);
    permitted.mockResolvedValue(false);
    expect(await isOn()).toBe(false); // revoked in the system settings
    await writeState({ enabled: false, userId: 7, seenId: 1 });
    permitted.mockResolvedValue(true);
    expect(await isOn()).toBe(false);
    await writeState({ enabled: null, userId: 7, seenId: 1 });
    expect(await isOn()).toBe(false);
  });
});

describe("resume", () => {
  it("re-schedules the check when alerts are on", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 1 });
    await resume();
    expect(registerAlertsTask).toHaveBeenCalled();
  });

  it("does not when they are off, or not allowed any more", async () => {
    await writeState({ enabled: false, userId: 7, seenId: 1 });
    await resume();
    await writeState({ enabled: true, userId: 7, seenId: 1 });
    permitted.mockResolvedValue(false);
    await resume();
    expect(registerAlertsTask).not.toHaveBeenCalled();
  });
});

describe("stopAlerts (sign-out)", () => {
  it("cancels the check, forgets everything and clears notifications left on the device", async () => {
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    await stopAlerts();
    expect(unregisterAlertsTask).toHaveBeenCalled();
    expect(await readState()).toEqual({ enabled: null, userId: null, seenId: null });
    expect(dismissAll).toHaveBeenCalled();
  });

  it("still forgets everything if cancelling the check fails", async () => {
    (unregisterAlertsTask as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    await writeState({ enabled: true, userId: 7, seenId: 40 });
    await stopAlerts();
    expect(await readState()).toEqual({ enabled: null, userId: null, seenId: null });
  });
});
