"use client";

/**
 * Theme provider.
 *
 * Two themes: dark (default, volcanic) and light ("Parchment").
 * - Writes `data-theme` on <html> so the CSS token layer swaps semantics.
 * - Resolves from localStorage → system preference, applied pre-paint by an
 *   inline script in layout.tsx to avoid a flash of the wrong theme.
 * - Honours `prefers-color-scheme` changes while the user has not made an
 *   explicit choice.
 *
 * Contrast for every token pair is verified by scripts/verify-contrast.mjs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "miab-theme";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

/**
 * Runs before first paint. Kept as a string so layout.tsx can inline it and
 * avoid the theme flash. Must stay in sync with STORAGE_KEY above.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(
  STORAGE_KEY
)};var s=localStorage.getItem(k);if(s==="dark"||s==="light"){document.documentElement.dataset.theme=s;return;}var m=window.matchMedia("(prefers-color-scheme: light)").matches;document.documentElement.dataset.theme=m?"light":"dark";}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Adopt whatever the bootstrap script already decided.
  useEffect(() => {
    const attr = document.documentElement.dataset.theme;
    if (isTheme(attr)) setThemeState(attr);
  }, []);

  // Track OS changes, but only while the user has not chosen explicitly.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (isTheme(stored)) return;
      const next: Theme = e.matches ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setThemeState(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Private mode: theme applies for this session only.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  }, [setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}