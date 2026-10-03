"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Global keyboard shortcuts.
 *
 * Ctrl/Cmd + Shift + L  → toggle language (Arabic ↔ English)
 * Ctrl/Cmd + Shift + T  → toggle theme (dark ↔ Parchment)
 *
 * Both are advertised on /account, so they have to exist. Deliberately *not*
 * bound while focus is in a text field, so the shortcuts can never fire in the
 * middle of someone writing a journal entry.
 */
export function Shortcuts() {
  const { toggle: toggleLocale } = useLocale();
  const { toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      // Never hijack a shortcut mid-sentence.
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "l":
          e.preventDefault();
          toggleLocale();
          break;
        case "t":
          e.preventDefault();
          toggleTheme();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleLocale, toggleTheme]);

  return null;
}
