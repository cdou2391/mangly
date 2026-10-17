import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/endpoints";
import { ping, restoreSession, setSessionListener } from "@/api/client";
import { setOnline, useOnline } from "@/api/reachability";
import type { User } from "@/api/types";
import { clearExports } from "@/export/shareLibrary";
import { clearSnapshot, isUsable, loadSnapshot, restoreInto, startPersisting, type Snapshot } from "@/cache/store";
import { stopAlerts } from "@/alerts";

/**
 * - loading: restoring the stored session
 * - signedOut: no session, or the server refused it
 * - signedIn: a session
 * - unreachable: there is a stored session but the server could not be asked (offline, down, slow) and there is no recent
 *   offline copy to show. The user is still signed in; the app waits and retries rather than sending them to the login screen.
 *
 * With a recent offline copy (see cache/store.ts) an unreachable server does not stop the app: it opens as signedIn on
 * the copy, read-only in effect (writes fail with the usual message), and reconnects in the background.
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
  /**
   * Changes the password. The server then ends every session, this device's included, so this signs the device in again with
   * the new password. Resolves true when it is still signed in; false when that last step failed and the device was signed out.
   */
  changePassword: (current: string, next: string) => Promise<boolean>;
  /** Ask the server again whether the stored session is good. Resolves when that attempt is over. */
  retry: () => Promise<void>;
}

/** How long the splash waits for the server before the app moves on to the "can't reach" screen (a late answer still wins). */
export const STARTUP_WAIT_MS = 8_000;
/** Pauses between automatic retries while unreachable; the last one repeats. */
export const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const status = useRef(state.status);
  status.current = state.status;
  const online = useOnline();

  // The offline copy is read once, at launch, while the session is being restored.
  const saved = useRef<Promise<Snapshot | null>>(null);
  saved.current ??= loadSnapshot();
  // Who is signed in, for the copy's owner; and when the data in the cache last came from the server.
  const userRef = useRef<User | null>(null);
  const syncedAt = useRef<number | null>(null);
  // Each session change gets a number so that a slow one cannot overwrite a newer one.
  const change = useRef(0);

  const applied = useRef(false);

  /**
   * The saved copy, if it is this user's (or nobody's yet) and recent enough; the first time, it is also put into the query
   * cache. Later calls leave the cache alone, because by then it holds newer data.
   */
  const loadCopy = useCallback(
    async (userId: number | null) => {
      const snap = await saved.current;
      if (!snap) return null;
      if (userId !== null && snap.user.id !== userId) {
        saved.current = Promise.resolve(null);
        await clearSnapshot(); // someone else's data
        return null;
      }
      if (!isUsable(snap)) return null;
      if (!applied.current) {
        applied.current = true;
        restoreInto(qc, snap);
        syncedAt.current = snap.syncedAt;
      }
      return snap;
    },
    [qc],
  );

  /** Drop everything remembered about the user: who they are, the offline copy on disk, and what the copy was loaded from. */
  const forget = useCallback(() => {
    userRef.current = null;
    syncedAt.current = null;
    applied.current = false;
    saved.current = Promise.resolve(null);
    void clearSnapshot();
    clearExports(); // a shared copy of the library is also theirs
  }, []);

  // One attempt to restore the session. A good answer reaches `state` through the session listener (set up below), so only
  // the outcomes that do not are handled here.
  const attempt = useCallback(async () => {
    const outcome = await restoreSession();
    if (outcome === "none") {
      forget();
      setState({ status: "signedOut" });
    } else if (outcome === "unreachable") {
      // Can't ask the server: open on the offline copy if there is a recent one, else wait on the "can't reach" screen.
      const snap = await loadCopy(null);
      if (snap) userRef.current ??= snap.user;
      setState((s) => {
        if (s.status === "signedIn") return s;
        if (s.status !== "loading" && s.status !== "unreachable") return s;
        return snap ? { status: "signedIn", user: snap.user } : { status: "unreachable" };
      });
    }
  }, [loadCopy, forget]);

  useEffect(() => {
    setSessionListener((pair) => {
      const mine = ++change.current;
      if (!pair) {
        qc.clear(); // nothing of this user's may outlive the session, in memory or on disk
        forget();
        setState({ status: "signedOut" });
        return;
      }
      void loadCopy(pair.user.id).then(() => {
        if (mine !== change.current) return;
        userRef.current = pair.user;
        setState({ status: "signedIn", user: pair.user });
      });
    });
    void attempt();
    // Don't keep the splash up for a slow network: after a while go on, to the offline copy or the "can't reach" screen.
    // The request goes on meanwhile, and if it answers the app moves on from wherever it is.
    const watchdog = setTimeout(() => {
      if (status.current !== "loading") return;
      void loadCopy(null).then((snap) => {
        if (snap) {
          userRef.current ??= snap.user;
          setOnline(false);
        }
        setState((s) => (s.status === "loading" ? (snap ? { status: "signedIn", user: snap.user } : { status: "unreachable" }) : s));
      });
    }, STARTUP_WAIT_MS);
    return () => clearTimeout(watchdog);
  }, [attempt, qc, loadCopy, forget]);

  // While the server can't be reached (either on the "can't reach" screen, or in the app on the offline copy): try again by
  // itself, backing off, and straight away when the app comes back to the foreground. In the app a plain ping is enough:
  // the first request after it renews the session by itself.
  const waiting = state.status === "unreachable" || (state.status === "signedIn" && !online);
  const tick = state.status === "unreachable" ? attempt : ping;
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let n = 0;
    const schedule = () => {
      timer = setTimeout(async () => {
        await tick();
        n += 1;
        if (!stopped) schedule();
      }, RETRY_DELAYS_MS[Math.min(n, RETRY_DELAYS_MS.length - 1)]);
    };
    schedule();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void tick();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [waiting, tick]);

  // Back online after being offline: refresh everything on screen.
  const wasOnline = useRef(true);
  useEffect(() => {
    if (online && !wasOnline.current && status.current === "signedIn") void qc.invalidateQueries();
    wasOnline.current = online;
  }, [online, qc]);

  // Keep the offline copy up to date while signed in.
  const userId = state.status === "signedIn" ? state.user.id : null;
  useEffect(() => {
    if (userId === null) return;
    const persister = startPersisting(qc, () => userRef.current, syncedAt.current);
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") persister.flush();
    });
    return () => {
      sub.remove();
      persister.stop();
    };
  }, [userId, qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authApi.login(email.trim().toLowerCase(), password, "Android");
  }, []);

  const signOut = useCallback(async () => {
    await stopAlerts().catch(() => {});
    await authApi.logout().catch(() => {});
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      const email = userRef.current?.email;
      await authApi.changePassword(current, next);
      if (!email) {
        await signOut(); // the session is gone and there is no way to renew it
        return false;
      }
      try {
        await authApi.login(email, next, "Android");
        return true;
      } catch {
        await signOut(); // the old session is gone for good; better the login screen than requests that all fail
        return false;
      }
    },
    [signOut],
  );

  const value = useMemo(() => ({ state, signIn, signOut, changePassword, retry: attempt }), [state, signIn, signOut, changePassword, attempt]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
