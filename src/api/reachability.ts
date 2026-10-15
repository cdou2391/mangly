import { useSyncExternalStore } from "react";

/**
 * Whether the last conversation with the server worked. Every request reports in from the API client, so this follows
 * reality without any polling of its own: a reply (of any kind) means online, a network failure or timeout means
 * offline. Settings shows it, and the app reconnects in the background while it reads offline.
 */
let online = true;
const listeners = new Set<() => void>();

export function isOnline() {
  return online;
}

export function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l());
}

export function subscribeConnection(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeConnection, isOnline, isOnline);
}
