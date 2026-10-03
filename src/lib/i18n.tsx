"use client";

/**
 * Locale provider — Arabic (RTL, default) and English (LTR).
 *
 * Scope note: this is a *document-level* locale. It flips `dir`/`lang` and the
 * shell chrome. Page bodies that ship bilingual content render both languages
 * in the same document (see the legal pages), which is deliberate: the copy is
 * Arabic-first and the English is the faithful translation of the same terms.
 *
 * Persisted locally now; the account-level preference is prompt-14 work and
 * will hydrate from Firestore when the profile document is extended.
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
import type { Locale } from "@/lib/nav";

const STORAGE_KEY = "miab-locale";

interface LocaleCtx {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  toggle: () => void;
  /** Pick the field matching the active locale. */
  t: (pair: { ar: string; en: string }) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

function isLocale(v: unknown): v is Locale {
  return v === "ar" || v === "en";
}

/** Pre-paint bootstrap, inlined by layout.tsx to avoid a direction flash. */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(
  STORAGE_KEY
)};var s=localStorage.getItem(k);if(s==="ar"||s==="en"){document.documentElement.lang=s;document.documentElement.dir=s==="ar"?"rtl":"ltr";return;}}catch(e){}})();`;

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const attr = document.documentElement.lang;
    if (isLocale(attr)) setLocaleState(attr);
  }, []);

  const apply = useCallback((next: Locale) => {
    const dir = next === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = next;
    document.documentElement.dir = dir;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: applies for this session only.
    }
  }, []);

  const setLocale = useCallback((l: Locale) => apply(l), [apply]);
  const toggle = useCallback(
    () => apply(document.documentElement.lang === "en" ? "ar" : "en"),
    [apply]
  );

  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      setLocale,
      toggle,
      t: (pair) => pair[locale],
    }),
    [locale, setLocale, toggle]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}