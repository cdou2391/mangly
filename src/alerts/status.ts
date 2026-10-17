import type { AlertsState } from "./state";

/** A check older than this, while alerts are on, is later than Android normally takes; the line warns about it. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
/** Fewer alerts than this are too few for a "typical" delay to mean anything. */
export const MIN_DELAY_SAMPLES = 3;

const MIN = 60_000;

/** "Just now", "12 min ago", "3 h ago", "2 d ago". */
export function ago(at: number, now: number): string {
  const ms = Math.max(0, now - at);
  if (ms < MIN) return "Just now";
  if (ms < 60 * MIN) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < 24 * 60 * MIN) return `${Math.floor(ms / (60 * MIN))} h ago`;
  return `${Math.floor(ms / (24 * 60 * MIN))} d ago`;
}

export interface CheckLine {
  value: string;
  /** Something is wrong, or at least later than it should be: shown in the alert colour. */
  warn: boolean;
}

const RESULT: Record<string, { text: (shown: number) => string; warn: boolean }> = {
  notified: { text: (n) => (n === 1 ? "1 notification shown" : `${n} notifications shown`), warn: false },
  nothing: { text: () => "nothing new", warn: false },
  baseline: { text: () => "all set", warn: false },
  unreachable: { text: () => "no connection", warn: false },
  failed: { text: () => "couldn't show it", warn: true },
  "no-permission": { text: () => "blocked in system settings", warn: true },
};

/** The "Last check" line in Settings: when the background check last ran and how it went. */
export function lastCheckLine(state: AlertsState, now: number): CheckLine {
  const last = state.lastCheck;
  if (!last) return { value: "Waiting for the first check", warn: false };
  const when = ago(last.at, now);
  const result = RESULT[last.result];
  if (now - last.at > STALE_AFTER_MS) return { value: `${when} · later than expected`, warn: true };
  return { value: `${when} · ${result.text(last.shown)}`, warn: result.warn };
}

/** The middle one of the recent delays in minutes, with how many it is based on; null while there are too few. */
export function typicalDelay(delays: number[]): { minutes: number; samples: number } | null {
  if (delays.length < MIN_DELAY_SAMPLES) return null;
  const sorted = [...delays].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const minutes = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { minutes, samples: sorted.length };
}

/** "About a minute", "About 35 min", "About 1 h 20 min", "About 3 h", "About 2 d". */
export function formatDelay(minutes: number): string {
  if (minutes < 2) return "About a minute";
  if (minutes < 60) return `About ${minutes} min`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m < 5 ? `About ${h} h` : `About ${h} h ${m} min`;
  }
  return `About ${Math.round(minutes / (24 * 60))} d`;
}
