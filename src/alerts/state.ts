import * as SecureStore from "expo-secure-store";

/**
 * What the alerts remember between runs (the background check runs in a fresh JS context, so it cannot share memory):
 * - enabled: the user's choice on this device; null until they have been asked
 * - userId: whose alerts `seenId` refers to
 * - seenId: the newest alert already shown, in the app or as a notification; null until a baseline is taken
 * - lastCheck: how the latest background check went, for the status line in Settings
 * - delays: for the last alerts shown, the minutes between MangaPulse creating the alert and this phone showing it
 */
export interface AlertsState {
  enabled: boolean | null;
  userId: number | null;
  seenId: number | null;
  lastCheck: LastCheck | null;
  delays: number[];
}

/** How a background check ended, when it actually looked (a check that was skipped is not recorded). */
export type CheckOutcome = "notified" | "no-permission" | "baseline" | "nothing" | "unreachable" | "failed";
export interface LastCheck {
  /** When it ran, in ms since 1970. */
  at: number;
  result: CheckOutcome;
  /** How many notifications it showed. */
  shown: number;
}

/** How many delays are kept: enough for a steady figure, small enough to stay current. */
export const MAX_DELAYS = 20;
const OUTCOMES: CheckOutcome[] = ["notified", "no-permission", "baseline", "nothing", "unreachable", "failed"];

const KEY = "mangly.alerts";
export const EMPTY: AlertsState = { enabled: null, userId: null, seenId: null, lastCheck: null, delays: [] };

function toLastCheck(x: unknown): LastCheck | null {
  if (typeof x !== "object" || x === null) return null;
  const v = x as Partial<LastCheck>;
  if (typeof v.at !== "number" || typeof v.shown !== "number" || v.shown < 0) return null;
  if (!OUTCOMES.includes(v.result as CheckOutcome)) return null;
  return { at: v.at, result: v.result as CheckOutcome, shown: v.shown };
}

export async function readState(): Promise<AlertsState> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<AlertsState>;
    const num = (x: unknown) => (typeof x === "number" ? x : null);
    return {
      enabled: typeof v.enabled === "boolean" ? v.enabled : null,
      userId: num(v.userId),
      seenId: num(v.seenId),
      lastCheck: toLastCheck(v.lastCheck),
      delays: Array.isArray(v.delays) ? v.delays.filter((d): d is number => typeof d === "number" && d >= 0).slice(-MAX_DELAYS) : [],
    };
  } catch {
    return EMPTY;
  }
}

export async function writeState(next: AlertsState): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(next));
}

/** Change part of the state. */
export async function patchState(patch: Partial<AlertsState>): Promise<AlertsState> {
  const next = { ...(await readState()), ...patch };
  await writeState(next);
  return next;
}

export async function clearState(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}
