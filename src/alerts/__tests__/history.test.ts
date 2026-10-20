import type { AppNotification } from "@/api/types";
import { appendHistory, clearHistory, MAX_HISTORY, readHistory, recordsFor, type AlertRecord } from "../history";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());

const alert = (id: number, over: Partial<AppNotification> = {}, title = "Chainsaw Man") =>
  ({ id, chapter_released: "191", created_at: "2026-10-17T11:30:00Z", manga: { canonical_name: title }, ...over }) as AppNotification;
const rec = (id: number, over: Partial<AlertRecord> = {}): AlertRecord => ({ id, title: `T${id}`, chapter: "1", found: 1000, sent: 2000, ...over });

beforeEach(() => {
  const { store } = require("@/test-utils/mocks");
  Object.keys(store).forEach((k) => delete store[k]);
});

describe("recordsFor", () => {
  it("pairs when the server created each alert with when it was shown", () => {
    expect(recordsFor([alert(11)], 5)).toEqual([{ id: 11, title: "Chainsaw Man", chapter: "191", found: Date.parse("2026-10-17T11:30:00Z"), sent: 5 }]);
  });
  it("skips an alert whose creation time cannot be read", () => {
    expect(recordsFor([alert(11, { created_at: "soon" }), alert(12)], 5).map((r) => r.id)).toEqual([12]);
  });
  it("has a name for a title that did not come with the alert, and for a chapter without a label", () => {
    const [r] = recordsFor([alert(11, { manga: undefined, chapter_released: "" })], 5);
    expect(r.title).toBe("A title in your library");
    expect(r.chapter).toBe("A new chapter");
  });
  it("shortens long names so the saved list stays small", () => {
    const [r] = recordsFor([alert(11, {}, "x".repeat(200))], 5);
    expect(r.title).toHaveLength(40);
    expect(r.title.endsWith("…")).toBe(true);
  });
});

describe("the saved list", () => {
  it("starts empty, and can be added to", async () => {
    expect(await readHistory()).toEqual([]);
    await appendHistory([rec(1), rec(2)]);
    expect((await readHistory()).map((r) => r.id)).toEqual([1, 2]);
    await appendHistory([rec(3)]);
    expect((await readHistory()).map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("keeps only the newest few", async () => {
    await appendHistory(Array.from({ length: MAX_HISTORY + 5 }, (_, i) => rec(i + 1)));
    const kept = await readHistory();
    expect(kept).toHaveLength(MAX_HISTORY);
    expect(kept[0].id).toBe(6);
    expect(kept.at(-1)!.id).toBe(MAX_HISTORY + 5);
  });
  it("does not list the same alert twice", async () => {
    await appendHistory([rec(1)]);
    await appendHistory([rec(1, { sent: 9999 }), rec(2)]);
    const kept = await readHistory();
    expect(kept.map((r) => r.id)).toEqual([1, 2]);
    expect(kept[0].sent).toBe(2000);
  });
  it("fits in one saved value even when full of long names", async () => {
    await appendHistory(recordsFor(Array.from({ length: MAX_HISTORY }, (_, i) => alert(1000 + i, { chapter_released: "9".repeat(60) }, "é".repeat(80))), Date.now()));
    const { store } = require("@/test-utils/mocks");
    expect(new TextEncoder().encode(store["mangly.alerts.history"]).length).toBeLessThan(2048);
  });
  it("adds nothing for an empty list", async () => {
    await appendHistory([]);
    expect(require("@/test-utils/mocks").store["mangly.alerts.history"]).toBeUndefined();
  });
  it("ignores damaged data instead of failing", async () => {
    const { store } = require("@/test-utils/mocks");
    store["mangly.alerts.history"] = "{not json";
    expect(await readHistory()).toEqual([]);
    store["mangly.alerts.history"] = JSON.stringify([rec(1), { id: "x" }, null, 5]);
    expect((await readHistory()).map((r) => r.id)).toEqual([1]);
    store["mangly.alerts.history"] = JSON.stringify({ not: "a list" });
    expect(await readHistory()).toEqual([]);
  });
  it("reads back only the newest few if more were somehow saved", async () => {
    require("@/test-utils/mocks").store["mangly.alerts.history"] = JSON.stringify(Array.from({ length: 15 }, (_, i) => rec(i + 1)));
    const kept = await readHistory();
    expect(kept).toHaveLength(MAX_HISTORY);
    expect(kept[0].id).toBe(6);
  });
  it("can be cleared", async () => {
    await appendHistory([rec(1)]);
    await clearHistory();
    expect(await readHistory()).toEqual([]);
  });
});
