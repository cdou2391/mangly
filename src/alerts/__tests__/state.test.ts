import * as SecureStore from "expo-secure-store";
import { EMPTY, MAX_DELAYS, patchState, readState } from "../state";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());

const save = (v: unknown) => SecureStore.setItemAsync("mangly.alerts", JSON.stringify(v));

beforeEach(() => {
  const { store } = require("@/test-utils/mocks");
  Object.keys(store).forEach((k) => delete store[k]);
});

describe("reading what was saved", () => {
  it("is empty when nothing was saved, or the saved text is not usable", async () => {
    expect(await readState()).toEqual(EMPTY);
    await SecureStore.setItemAsync("mangly.alerts", "{not json");
    expect(await readState()).toEqual(EMPTY);
  });

  it("reads a state saved by an older version, which had no status or delays", async () => {
    await save({ enabled: true, userId: 7, seenId: 40 });
    expect(await readState()).toEqual({ ...EMPTY, enabled: true, userId: 7, seenId: 40 });
  });

  it("reads the status and the delays back", async () => {
    await save({ enabled: true, userId: 7, seenId: 40, lastCheck: { at: 1000, result: "notified", shown: 2 }, delays: [5, 30] });
    expect(await readState()).toEqual({ enabled: true, userId: 7, seenId: 40, lastCheck: { at: 1000, result: "notified", shown: 2 }, delays: [5, 30] });
  });

  it.each([
    ["not an object", "x"],
    ["no time", { result: "nothing", shown: 0 }],
    ["a time that is not a number", { at: "now", result: "nothing", shown: 0 }],
    ["an unknown result", { at: 1, result: "exploded", shown: 0 }],
    ["a negative count", { at: 1, result: "nothing", shown: -1 }],
    ["no count", { at: 1, result: "nothing" }],
  ])("drops a status with %s", async (_why, lastCheck) => {
    await save({ enabled: true, userId: 1, seenId: 1, lastCheck });
    expect((await readState()).lastCheck).toBeNull();
  });

  it("keeps only usable delays: numbers that are not negative", async () => {
    await save({ delays: [1, "2", null, -3, 4.5, 0, true, 10] });
    expect((await readState()).delays).toEqual([1, 4.5, 0, 10]);
  });

  it("keeps only the latest twenty delays", async () => {
    await save({ delays: Array.from({ length: 30 }, (_, i) => 100 + i) });
    const { delays } = await readState();
    expect(delays).toHaveLength(MAX_DELAYS);
    expect(delays[0]).toBe(110);
    expect(delays.at(-1)).toBe(129);
  });

  it("treats delays that are not a list as none", async () => {
    await save({ delays: "5,10" });
    expect((await readState()).delays).toEqual([]);
  });
});

describe("changing part of it", () => {
  it("keeps the rest", async () => {
    await save({ enabled: true, userId: 7, seenId: 40, lastCheck: { at: 1, result: "nothing", shown: 0 }, delays: [9] });
    await patchState({ seenId: 41 });
    expect(await readState()).toEqual({ enabled: true, userId: 7, seenId: 41, lastCheck: { at: 1, result: "nothing", shown: 0 }, delays: [9] });
  });
});
