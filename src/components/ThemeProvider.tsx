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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    function sync() {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        saved = document.documentElement.dataset.theme ?? null;
      }
      const next = isTheme(saved) ? saved : media.matches ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setThemeState(next);
    }
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
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