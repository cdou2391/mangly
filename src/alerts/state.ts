import * as SecureStore from "expo-secure-store";

/**
 * What the alerts remember between runs (the background check runs in a fresh JS context, so it cannot share memory):
 * - enabled: the user's choice on this device; null until they have been asked
 * - userId: whose alerts `seenId` refers to
 * - seenId: the newest alert already shown, in the app or as a notification; null until a baseline is taken
 */
export interface AlertsState {
  enabled: boolean | null;
  userId: number | null;
  seenId: number | null;
}

const KEY = "mangly.alerts";
export const EMPTY: AlertsState = { enabled: null, userId: null, seenId: null };

export async function readState(): Promise<AlertsState> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<AlertsState>;
    const num = (x: unknown) => (typeof x === "number" ? x : null);
    return { enabled: typeof v.enabled === "boolean" ? v.enabled : null, userId: num(v.userId), seenId: num(v.seenId) };
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
