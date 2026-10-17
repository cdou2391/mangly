import { File, Paths } from "expo-file-system";
import { dehydrate, hydrate, type DehydratedState, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { User } from "@/api/types";

/**
 * The offline copy of what the app shows: the library, the latest chapters and the alerts, plus who they belong to.
 * It lives in the app's private storage (backups are off, see app.json) and is deleted on sign-out. It is only ever read
 * when the server cannot be reached, and it is thrown away once it is older than MAX_AGE_MS without a successful refresh.
 */
export const CACHE_VERSION = 1;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A clock set back would make an old copy look new; anything saved further ahead than this is not trusted. */
const CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 1_000;

/**
 * The query keys that make up the offline copy: what the Library shows. The recommendations at the top ("home-picks") are
 * kept too, so the hero is still there when the server cannot be reached. Search results and anything else stay online-only.
 */
const PERSISTED_KEYS = ["tracked", "recent-chapters", "notifications", "home-picks"];
export const isPersistedKey = (key: QueryKey) => PERSISTED_KEYS.includes(key[0] as string);

export interface Snapshot {
  version: number;
  user: User;
  /** When a persisted query last came back from the server (not from the cache, not from an optimistic edit). */
  syncedAt: number;
  state: DehydratedState;
}

// The only place that touches the disk.
const file = () => new File(Paths.document, "mangapulse-cache.json");
const readText = async (): Promise<string | null> => (file().exists ? file().text() : null);
const writeText = (text: string) => file().write(text);
const removeFile = () => {
  if (file().exists) file().delete();
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isSnapshot(v: unknown): v is Snapshot {
  if (!isObject(v) || v.version !== CACHE_VERSION || typeof v.syncedAt !== "number") return false;
  if (!isObject(v.user) || typeof v.user.id !== "number") return false;
  return isObject(v.state) && Array.isArray(v.state.queries);
}

/** The saved copy, or null when there is none or it cannot be trusted (missing, unreadable, another app version). Never throws. */
export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const text = await readText();
    if (text === null) return null;
    const parsed: unknown = JSON.parse(text);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether a copy may be shown: it must be recent. Past MAX_AGE_MS the app insists on a fresh answer from the server. */
export function isUsable(snapshot: Snapshot | null, now = Date.now()): snapshot is Snapshot {
  if (!snapshot) return false;
  const age = now - snapshot.syncedAt;
  return age <= MAX_AGE_MS && age >= -CLOCK_SLACK_MS;
}

export async function clearSnapshot() {
  try {
    removeFile();
  } catch {
    // nothing sensible to do; the copy is also ignored once it is old or belongs to someone else
  }
}

/** Load a saved copy into the query cache. Newer data already in the cache is kept. */
export function restoreInto(client: QueryClient, snapshot: Snapshot) {
  hydrate(client, snapshot.state);
}

/** A refresh that failed (offline) leaves the old data in place with an error status; what is saved is the data, not the failure. */
function toSavedState(state: DehydratedState): DehydratedState {
  return { ...state, queries: state.queries.map((q) => ({ ...q, state: { ...q.state, status: "success", error: null } })) };
}

/**
 * Keep the saved copy in step with the query cache. Saves a moment after the last change and when the app goes to the
 * background. Nothing is written until the server has answered at least once (or a saved copy was loaded), so a fresh
 * sign-in never saves an empty copy.
 */
export function startPersisting(client: QueryClient, getUser: () => User | null, syncedAt: number | null) {
  let synced = syncedAt;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const save = () => {
    timer = undefined;
    const user = getUser();
    if (stopped || !user || synced === null) return;
    const snapshot: Snapshot = {
      version: CACHE_VERSION,
      user,
      syncedAt: synced,
      state: toSavedState(dehydrate(client, { shouldDehydrateQuery: (q) => q.state.data !== undefined && isPersistedKey(q.queryKey) })),
    };
    try {
      writeText(JSON.stringify(snapshot));
    } catch (e) {
      console.warn("Could not save the offline copy", e);
    }
  };
  const schedule = () => {
    if (!timer && !stopped) timer = setTimeout(save, SAVE_DELAY_MS);
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (!isPersistedKey(event.query.queryKey)) return;
    if (event.type === "updated" && event.action.type === "success" && !event.action.manual) synced = Date.now();
    schedule();
  });

  return {
    /** Save now, if anything is waiting to be saved. */
    flush() {
      if (timer) {
        clearTimeout(timer);
        save();
      }
    },
    stop() {
      stopped = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    },
  };
}
