"use client";

import { doc, onSnapshot } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { db, paths } from "@/lib/firebase";
import {
  FALLBACK_NAV,
  mobileOverflow,
  mobilePrimary,
  normaliseNav,
  type NavItem,
} from "@/lib/nav";

/**
 * Shell configuration.
 *
 * Ships the static `FALLBACK_NAV` immediately (no layout shift, no spinner)
 * and upgrades to `siteConfig/nav` when — and only when — that document exists
 * and validates. A malformed document is ignored rather than throwing.
 */

export interface NavConfig {
  items: NavItem[];
  primary: NavItem[];
  overflow: NavItem[];
  source: "fallback" | "remote";
}

interface ShellCtx extends NavConfig {
  railCollapsed: boolean;
  setRailCollapsed: (v: boolean) => void;
}

const Ctx = createContext<ShellCtx | null>(null);

const RAIL_KEY = "miab-rail-collapsed";

function derive(items: NavItem[], source: NavConfig["source"]): NavConfig {
  return { items, primary: mobilePrimary(items), overflow: mobileOverflow(items), source };
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<NavConfig>(() => derive(FALLBACK_NAV, "fallback"));
  const [railCollapsed, setRailCollapsedState] = useState(true);

  // Collapsed rail preference is remembered locally.
  useEffect(() => {
    try {
      if (localStorage.getItem(RAIL_KEY) === "expanded") setRailCollapsedState(false);
    } catch {
      // Ignore: default to collapsed.
    }
  }, []);

  // Upgrade to remote nav when available.
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, `${paths.siteConfig}/nav`),
      (snap) => {
        if (!snap.exists()) return;
        const parsed = normaliseNav(snap.data()?.items);
        if (parsed) setConfig(derive(parsed, "remote"));
      },
      () => undefined
    );
  }, []);

  const setRailCollapsed = useCallback((v: boolean) => {
    setRailCollapsedState(v);
    try {
      localStorage.setItem(RAIL_KEY, v ? "collapsed" : "expanded");
    } catch {
      // Ignore.
    }
  }, []);

  const value = useMemo<ShellCtx>(
    () => ({ ...config, railCollapsed, setRailCollapsed }),
    [config, railCollapsed, setRailCollapsed]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): ShellCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}