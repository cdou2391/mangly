import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "@/api/endpoints";
import { refreshSession, setSessionListener } from "@/api/client";
import type { User } from "@/api/types";
import { tokenStore } from "./tokenStore";
import { unregisterPush } from "@/push/register";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    setSessionListener((pair) =>
      setState(pair ? { status: "signedIn", user: pair.user } : { status: "signedOut" }),
    );
    (async () => {
      // Restore the session from the stored refresh token. Offline start keeps the token and shows signed-out
      // only if the server explicitly rejects it (refreshSession drops the session in that case).
      const hasToken = !!(await tokenStore.getRefreshToken());
      if (!hasToken) return setState({ status: "signedOut" });
      const ok = await refreshSession();
      if (!ok) setState((s) => (s.status === "loading" ? { status: "signedOut" } : s));
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await authApi.login(email.trim().toLowerCase(), password, "Android");
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {});
    await authApi.logout().catch(() => {});
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
