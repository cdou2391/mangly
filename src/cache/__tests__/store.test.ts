import { File, Paths } from "expo-file-system";
import { QueryClient } from "@tanstack/react-query";
import type { User } from "@/api/types";
import { CACHE_VERSION, MAX_AGE_MS, clearSnapshot, isPersistedKey, isUsable, loadSnapshot, restoreInto, startPersisting, type Snapshot } from "../store";

const user = { id: 1, full_name: "Ada" } as User;
const file = () => new File(Paths.document, "mangapulse-cache.json");
const saved = () => JSON.parse(file().textSync()) as Snapshot;
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

let now: number;
beforeEach(() => {
  jest.useFakeTimers();
  now = Date.now();
  if (file().exists) file().delete();
});
afterEach(() => jest.useRealTimers());

describe("what is kept", () => {
  it("is what the Library shows: the library, the latest chapters, the alerts and the recommendations at the top, and nothing else", () => {
    expect(isPersistedKey(["home-picks"])).toBe(true);
    expect(isPersistedKey(["tracked"])).toBe(true);
    expect(isPersistedKey(["recent-chapters"])).toBe(true);
    expect(isPersistedKey(["notifications"])).toBe(true);
    expect(isPersistedKey(["search", "berserk"])).toBe(false);
  });
});

describe("loading", () => {
  it("is null when nothing was saved", async () => {
    expect(await loadSnapshot()).toBeNull();
  });

  it("is null, not an error, when the file is garbage", async () => {
    file().write("{not json");
    expect(await loadSnapshot()).toBeNull();
  });

  it("is null for a copy from another version of the app", async () => {
    file().write(JSON.stringify({ version: CACHE_VERSION + 1, user, syncedAt: now, state: { queries: [], mutations: [] } }));
    expect(await loadSnapshot()).toBeNull();
  });

  it("is null for a file that is not shaped like a copy", async () => {
    file().write(JSON.stringify({ version: CACHE_VERSION, user: {}, syncedAt: now, state: {} }));
    expect(await loadSnapshot()).toBeNull();
  });
});

describe("how old is too old", () => {
  const snap = (syncedAt: number) => ({ syncedAt }) as Snapshot;
  it("accepts a copy under seven days old", () => {
    expect(isUsable(snap(now - MAX_AGE_MS + 1000), now)).toBe(true);
  });
  it("refuses a copy over seven days old", () => {
    expect(isUsable(snap(now - MAX_AGE_MS - 1000), now)).toBe(false);
  });
  it("refuses a copy dated well into the future", () => {
    expect(isUsable(snap(now + 3 * 86_400_000), now)).toBe(false);
  });
  it("refuses no copy", () => {
    expect(isUsable(null, now)).toBe(false);
  });
  it("is seven days", () => {
    expect(MAX_AGE_MS).toBe(7 * 86_400_000);
  });
});

describe("saving", () => {
  it("writes what the server sent, a moment after it arrives, and a restart can read it back", async () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, null);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [{ id: 7 }] });
    await client.fetchQuery({ queryKey: ["search", "x"], queryFn: async () => ["not kept"] });
    expect(file().exists).toBe(false); // debounced
    jest.advanceTimersByTime(1100);
    expect(file().exists).toBe(true);

    const loaded = (await loadSnapshot())!;
    expect(loaded.user).toEqual(user);
    expect(loaded.state.queries.map((q) => q.queryKey)).toEqual([["tracked"]]);

    const fresh = makeClient();
    restoreInto(fresh, loaded);
    expect(fresh.getQueryData(["tracked"])).toEqual([{ id: 7 }]);
    persist.stop();
  });

  it("keeps the recommendations too, and brings them back after a restart, so the hero survives being offline", async () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, null);
    await client.fetchQuery({ queryKey: ["home-picks"], queryFn: async () => [{ id: 7, title: "Berserk" }] });
    jest.advanceTimersByTime(1100);
    persist.stop();
    const fresh = makeClient();
    restoreInto(fresh, (await loadSnapshot())!);
    expect(fresh.getQueryData(["home-picks"])).toEqual([{ id: 7, title: "Berserk" }]);
  });

  it("writes once for a burst of changes", async () => {
    const client = makeClient();
    const write = jest.spyOn(File.prototype, "write");
    const persist = startPersisting(client, () => user, null);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [1] });
    await client.fetchQuery({ queryKey: ["notifications"], queryFn: async () => [2] });
    await client.fetchQuery({ queryKey: ["recent-chapters"], queryFn: async () => [3] });
    jest.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
    persist.stop();
  });

  it("stamps the time the server last answered", async () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, null);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [] });
    const answered = Date.now();
    jest.advanceTimersByTime(1100);
    expect(saved().syncedAt).toBe(answered);
    persist.stop();
  });

  it("does not write anything before the server has answered, so a new sign-in never saves an empty copy", () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, null);
    client.setQueryData(["tracked"], [{ id: 1 }]); // an edit, not an answer
    jest.advanceTimersByTime(5000);
    expect(file().exists).toBe(false);
    persist.stop();
  });

  it("does not make an old copy look new: edits and failed refreshes keep its age", async () => {
    const old = now - 3 * 86_400_000;
    const client = makeClient();
    client.setQueryData(["tracked"], [{ id: 1 }]);
    const persist = startPersisting(client, () => user, old);
    client.setQueryData(["tracked"], [{ id: 1, read: true }]); // optimistic edit
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => Promise.reject(new Error("offline")), staleTime: 0 }).catch(() => {});
    jest.advanceTimersByTime(1100);
    expect(saved().syncedAt).toBe(old);
    persist.stop();
  });

  it("keeps the data of a query whose refresh failed", async () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, now);
    client.setQueryData(["tracked"], [{ id: 1 }]);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: () => Promise.reject(new Error("offline")), staleTime: 0 }).catch(() => {});
    expect(client.getQueryState(["tracked"])?.status).toBe("error");
    jest.advanceTimersByTime(1100);
    const q = saved().state.queries[0];
    expect(q.state.data).toEqual([{ id: 1 }]);
    expect(q.state.status).toBe("success");
    persist.stop();
  });

  it("writes nothing for someone who has signed out", async () => {
    const client = makeClient();
    let who: User | null = user;
    const persist = startPersisting(client, () => who, now);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [1] });
    who = null;
    jest.advanceTimersByTime(5000);
    expect(file().exists).toBe(false);
    persist.stop();
  });

  it("writes nothing once stopped", async () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, now);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [1] });
    persist.stop();
    jest.advanceTimersByTime(5000);
    expect(file().exists).toBe(false);
  });

  it("flushes a waiting save at once (the app going to the background)", async () => {
    const client = makeClient();
    const persist = startPersisting(client, () => user, now);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [1] });
    persist.flush();
    expect(file().exists).toBe(true);
    persist.stop();
  });

  it("survives a disk that refuses the write", async () => {
    const client = makeClient();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const write = jest.spyOn(File.prototype, "write").mockImplementation(() => {
      throw new Error("disk full");
    });
    const persist = startPersisting(client, () => user, now);
    await client.fetchQuery({ queryKey: ["tracked"], queryFn: async () => [1] });
    expect(() => jest.advanceTimersByTime(1100)).not.toThrow();
    write.mockRestore();
    warn.mockRestore();
    persist.stop();
  });
});

describe("clearing", () => {
  it("deletes the copy", async () => {
    file().write("x");
    await clearSnapshot();
    expect(file().exists).toBe(false);
  });

  it("is fine when there is nothing to delete", async () => {
    await expect(clearSnapshot()).resolves.toBeUndefined();
  });
});
