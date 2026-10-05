"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Updates the `theme-color` meta tag to match the active theme.
 *
 * The `viewport` export in `layout.tsx` sets the initial value via
 * `prefers-color-scheme`, but once the client hydrates and the user's
 * saved preference (or explicit toggle) takes over, the browser chrome
 * would stay the old colour unless we update it here.
 *
 * Runs after mount so it never flashes the wrong colour.
 */
export function ThemeColorUpdater() {
  const { theme } = useTheme();

  useEffect(() => {
    const color = theme === "dark" ? "#050505" : "#f8f4e8";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  }, [theme]);

  return null;
}