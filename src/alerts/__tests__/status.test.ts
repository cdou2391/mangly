import { EMPTY, type AlertsState, type CheckOutcome } from "../state";
import { STALE_AFTER_MS, ago, formatDelay, formatWhen, lastCheckLine, lateBy, typicalDelay } from "../status";

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

describe("formatWhen", () => {
  const now = new Date(2026, 9, 20, 15, 0).getTime(); // Oct 20, 15:00 local time
  const at = (m: number, d: number, h: number, min: number) => new Date(2026, m, d, h, min).getTime();
  it("says Today and Yesterday with the clock time", () => {
    expect(formatWhen(at(9, 20, 14, 2), now)).toBe("Today 14:02");
    expect(formatWhen(at(9, 20, 0, 5), now)).toBe("Today 00:05");
    expect(formatWhen(at(9, 19, 23, 59), now)).toBe("Yesterday 23:59");
  });
  it("gives the date for anything older", () => {
    expect(formatWhen(at(9, 18, 9, 10), now)).toBe("Oct 18 · 09:10");
    expect(formatWhen(at(0, 3, 18, 30), now)).toBe("Jan 3 · 18:30");
  });
});

describe("lateBy", () => {
  it("measures from when the chapter was found to when the notification was shown", () => {
    expect(lateBy(0, 20_000)).toBe("Under a minute later");
    expect(lateBy(0, 35 * MIN)).toBe("35 min later");
    expect(lateBy(0, 60 * MIN)).toBe("1 h later");
    expect(lateBy(0, 80 * MIN)).toBe("1 h 20 min later");
    expect(lateBy(0, 3 * 24 * 60 * MIN)).toBe("3 d later");
  });
  it("is never negative, if the phone's clock is behind the server's", () => {
    expect(lateBy(10 * MIN, 0)).toBe("Under a minute later");
  });
});
