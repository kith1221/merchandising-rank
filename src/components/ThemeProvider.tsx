"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "ranksports-theme";
export const THEME_EVENT = "ranksports-theme-change";

export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function subscribeMode(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function subscribeSystem(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: light)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribeMode, readStoredMode, () => "system" as ThemeMode);
  const system = useSyncExternalStore(subscribeSystem, readSystemTheme, () => "dark" as ResolvedTheme);
  const resolved: ResolvedTheme = mode === "system" ? system : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Penyimpanan browser penuh atau diblokir - tema tetap berjalan di memori.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggle = useCallback(() => {
    const current = readStoredMode();
    const active = current === "system" ? readSystemTheme() : current;
    setMode(active === "dark" ? "light" : "dark");
  }, [setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme harus dipakai di dalam ThemeProvider");
  return context;
}