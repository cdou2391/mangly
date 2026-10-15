import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { authApi } from "@/api/endpoints";
import { restoreSession, setSessionListener } from "@/api/client";
import type { User } from "@/api/types";
import { unregisterPush } from "@/push/register";

/**
 * - loading: restoring the stored session
 * - signedOut: no session, or the server refused it
 * - signedIn: a session
 * - unreachable: there is a stored session but the server could not be asked (offline, down, slow). The user is still
 *   signed in; the app waits and retries rather than sending them to the login screen.
 */
export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User }
  | { status: "unreachable" };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Ask the server again whether the stored session is good. Resolves when that attempt is over. */
  retry: () => Promise<void>;
}

/** How long the splash waits for the server before the app moves on to the "can't reach" screen (a late answer still wins). */
export const STARTUP_WAIT_MS = 8_000;
/** Pauses between automatic retries while unreachable; the last one repeats. */
export const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const status = useRef(state.status);
  status.current = state.status;

  // One attempt to restore the session. A good answer reaches `state` through the session listener (set up below), so only
  // the outcomes that do not are handled here.
  const attempt = useCallback(async () => {
    const outcome = await restoreSession();
    if (outcome === "none") setState({ status: "signedOut" });
    else if (outcome === "unreachable") setState((s) => (s.status === "signedIn" ? s : { status: "unreachable" }));
  }, []);

  useEffect(() => {
    setSessionListener((pair) => setState(pair ? { status: "signedIn", user: pair.user } : { status: "signedOut" }));
    void attempt();
    // Don't keep the splash up for a slow network: after a while go on to the "can't reach" screen. The request goes on
    // meanwhile, and if it answers the app moves on from wherever it is.
    const watchdog = setTimeout(() => setState((s) => (s.status === "loading" ? { status: "unreachable" } : s)), STARTUP_WAIT_MS);
    return () => clearTimeout(watchdog);
  }, [attempt]);

  // While unreachable: try again by itself, backing off, and straight away when the app comes back to the foreground.
  useEffect(() => {
    if (state.status !== "unreachable") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let n = 0;
    const schedule = () => {
      timer = setTimeout(async () => {
        await attempt();
        n += 1;
        if (!stopped) schedule();
      }, RETRY_DELAYS_MS[Math.min(n, RETRY_DELAYS_MS.length - 1)]);
    };
    schedule();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && status.current === "unreachable") void attempt();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [state.status, attempt]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authApi.login(email.trim().toLowerCase(), password, "Android");
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {});
    await authApi.logout().catch(() => {});
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut, retry: attempt }), [state, signIn, signOut, attempt]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
