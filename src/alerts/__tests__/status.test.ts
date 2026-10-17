import { EMPTY, type AlertsState, type CheckOutcome } from "../state";
import { STALE_AFTER_MS, ago, formatDelay, lastCheckLine, typicalDelay } from "../status";

const MIN = 60_000;
const NOW = Date.parse("2026-10-17T12:00:00Z");
const state = (result: CheckOutcome | null, minutesAgo = 5, shown = 0): AlertsState => ({
  ...EMPTY,
  enabled: true,
  lastCheck: result ? { at: NOW - minutesAgo * MIN, result, shown } : null,
});

describe("ago", () => {
  it.each([
    [0, "Just now"],
    [59_000, "Just now"],
    [60_000, "1 min ago"],
    [12 * MIN, "12 min ago"],
    [59 * MIN, "59 min ago"],
    [60 * MIN, "1 h ago"],
    [23 * 60 * MIN, "23 h ago"],
    [24 * 60 * MIN, "1 d ago"],
    [50 * 60 * MIN, "2 d ago"],
  ])("%d ms is %s", (ms, text) => {
    expect(ago(NOW - ms, NOW)).toBe(text);
  });

  it("is 'Just now' for a time in the future, such as after the clock was set back", () => {
    expect(ago(NOW + 5 * MIN, NOW)).toBe("Just now");
  });
});

describe("lastCheckLine", () => {
  it("waits for the first check", () => {
    expect(lastCheckLine(state(null), NOW)).toEqual({ value: "Waiting for the first check", warn: false });
  });

  it.each([
    ["nothing", 0, "nothing new", false],
    ["baseline", 0, "all set", false],
    ["unreachable", 0, "no connection", false],
    ["notified", 1, "1 notification shown", false],
    ["notified", 3, "3 notifications shown", false],
    ["failed", 0, "couldn't show it", true],
    ["no-permission", 0, "blocked in system settings", true],
  ] as const)("says how a '%s' check went (%d shown)", (result, shown, text, warn) => {
    expect(lastCheckLine(state(result, 12, shown), NOW)).toEqual({ value: `12 min ago · ${text}`, warn });
  });

  it("warns about a check older than Android normally takes, whatever it found", () => {
    const old = STALE_AFTER_MS / MIN + 1;
    expect(lastCheckLine(state("nothing", old), NOW)).toEqual({ value: "6 h ago · later than expected", warn: true });
    expect(lastCheckLine(state("unreachable", old), NOW).warn).toBe(true);
  });

  it("does not warn at exactly the limit", () => {
    expect(lastCheckLine(state("nothing", STALE_AFTER_MS / MIN), NOW).warn).toBe(false);
  });
});

describe("typicalDelay", () => {
  it("is nothing until there are three alerts to go on", () => {
    expect(typicalDelay([])).toBeNull();
    expect(typicalDelay([10, 20])).toBeNull();
    expect(typicalDelay([10, 20, 30])).toEqual({ minutes: 20, samples: 3 });
  });

  it("is the middle one, so one very late alert does not drag it", () => {
    expect(typicalDelay([5, 6, 7, 8, 600])).toEqual({ minutes: 7, samples: 5 });
  });

  it("averages the two middle ones for an even count, rounded", () => {
    expect(typicalDelay([10, 20, 30, 41])).toEqual({ minutes: 25, samples: 4 }); // (20 + 30) / 2
    expect(typicalDelay([10, 20, 31, 40])).toEqual({ minutes: 26, samples: 4 }); // 25.5 rounds up
  });

  it("does not change the list it is given", () => {
    const list = [30, 10, 20];
    typicalDelay(list);
    expect(list).toEqual([30, 10, 20]);
  });
});

describe("formatDelay", () => {
  it.each([
    [0, "About a minute"],
    [1, "About a minute"],
    [2, "About 2 min"],
    [35, "About 35 min"],
    [59, "About 59 min"],
    [60, "About 1 h"],
    [64, "About 1 h"],
    [80, "About 1 h 20 min"],
    [180, "About 3 h"],
    [47 * 60, "About 47 h"],
    [48 * 60, "About 2 d"],
    [75 * 60, "About 3 d"],
  ])("%d minutes is '%s'", (m, text) => {
    expect(formatDelay(m)).toBe(text);
  });
});
