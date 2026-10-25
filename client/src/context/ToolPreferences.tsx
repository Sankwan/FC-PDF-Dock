import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { readToolPreferences, saveToolPreferences, recordToolVisit, type ToolPreferences } from "@/lib/toolPreferences";
interface Value { preferences: ToolPreferences; clearUsage: () => void }
const Context = createContext<Value | null>(null);
export function ToolPreferencesProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [preferences, set] = useState(() => readToolPreferences(scope));
  const [path] = useLocation(), previous = useRef<string | null>(null);
  useEffect(() => { saveToolPreferences(scope, preferences); }, [scope, preferences]);
  useEffect(() => {
    if (previous.current === path) return;
    previous.current = path;
    const id = path.replace(/^\//, "");
    if (id && !["sign-in", "create-account", "verify"].includes(id)) set(p => recordToolVisit(p, id));
  }, [path]);
  return <Context.Provider value={{ preferences, clearUsage: () => set(p => ({ ...p, visits: {} })) }}>{children}</Context.Provider>;
}
export function useToolPreferences() { const value = useContext(Context); if (!value) throw new Error("Tool preferences provider is missing"); return value; }
