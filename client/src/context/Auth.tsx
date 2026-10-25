import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { features } from "@/brand";
import { demoUser, readDemoSession, writeDemoSession } from "@/lib/demoAccess";

/**
 * Staff sign-in state. The session itself is an HttpOnly cookie set by
 * services/auth, so JavaScript never sees the token. What we keep in
 * localStorage is only the signed-in person's email, so that the
 * installed app still opens on a device with no connection (an outstation,
 * or a laptop on the road). The server-side tools (PDF to Word) check the
 * real session cookie on every request, so this cache grants nothing on its
 * own.
 */

/** Only the email is stored; the names are worked out from it for greetings. */
export interface StaffUser {
  email: string;
  firstName: string;
  lastName: string;
}

type Status = "loading" | "signed-in" | "signed-out";

interface AuthValue {
  status: Status;
  user: StaffUser | null;
  /** true when we're trusting the cached profile because the server can't be reached */
  offline: boolean;
  isDemo: boolean;
  enterDemo: () => void;
  setSignedIn: (user: StaffUser) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CACHE_KEY = "pdfdock.staff";
// Offline access lasts as long as the server session would (SESSION_DAYS).
const OFFLINE_GRACE_MS = 30 * 24 * 3600_000;

interface CachedUser {
  user: StaffUser;
  verifiedAt: number;
}

const readCache = (): CachedUser | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUser;
    if (!parsed?.user?.email || Date.now() - parsed.verifiedAt > OFFLINE_GRACE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (user: StaffUser | null) => {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify({ user, verifiedAt: Date.now() }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage can be unavailable (private mode); sign-in still works for this tab */
  }
};

const AuthContext = createContext<AuthValue | null>(null);

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public field?: string, public retryAfter?: number) {
    super(message);
  }
}

export const authFetch = async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`/api/auth${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the head-office server. Check your connection and try again.", 0, "network");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // An HTML page here means the API isn't behind this address (e.g. a
    // static build opened without the head-office proxy).
    throw new ApiError("The sign-in service isn't available on this address.", res.status, "no_api");
  }
  if (!res.ok) {
    throw new ApiError(data?.message ?? "Something went wrong. Try again.", res.status, data?.error ?? "error", data?.field, data?.retryAfter);
  }
  return data as T;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cached = features.authRequired ? readCache() : null;
  const [isDemo, setIsDemo] = useState(() => readDemoSession(features.demoMode));
  const [status, setStatus] = useState<Status>(features.authRequired ? (isDemo || cached ? "signed-in" : features.demoMode ? "signed-out" : "loading") : "signed-in");
  const [user, setUser] = useState<StaffUser | null>(isDemo ? demoUser : cached?.user ?? null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!features.authRequired) return;
    if (isDemo) return;
    // A serverless pilot must not make an unavailable auth API a prerequisite.
    if (features.demoMode && !readCache()) { setStatus("signed-out"); return; }
    try {
      const { user: fresh } = await authFetch<{ user: StaffUser }>("/me");
      setUser(fresh);
      setStatus("signed-in");
      setOffline(false);
      writeCache(fresh);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        writeCache(null);
        setUser(null);
        setStatus("signed-out");
        setOffline(false);
        return;
      }
      // Server unreachable: keep the cached profile if we have one.
      const c = readCache();
      if (c) {
        setUser(c.user);
        setStatus("signed-in");
        setOffline(true);
      } else {
        setStatus("signed-out");
        setOffline(err instanceof ApiError && err.code === "network");
      }
    }
  }, [isDemo]);

  useEffect(() => {
    refresh();
    const onOnline = () => refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  const setSignedIn = useCallback((u: StaffUser) => {
    writeDemoSession(false);
    setIsDemo(false);
    writeCache(u);
    setUser(u);
    setStatus("signed-in");
    setOffline(false);
  }, []);

  const enterDemo = useCallback(() => {
    if (!features.demoMode) return;
    writeDemoSession(true);
    setIsDemo(true);
    setUser(demoUser);
    setStatus("signed-in");
    setOffline(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { writeScanDraft } = await import("@/lib/scanDraft");
      if (user?.email) await writeScanDraft(null, user.email);
    } catch { /* Local draft storage may be unavailable. Account scopes still isolate drafts. */ }
    try {
      if (!isDemo) await authFetch("/logout", { method: "POST", body: {} });
    } catch {
      /* signing out locally still matters when offline */
    }
    writeCache(null);
    writeDemoSession(false);
    setIsDemo(false);
    setUser(null);
    setStatus("signed-out");
  }, [user?.email, isDemo]);

  const value = useMemo(
    () => ({ status, user, offline, isDemo, enterDemo, setSignedIn, signOut, refresh }),
    [status, user, offline, isDemo, enterDemo, setSignedIn, signOut, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
