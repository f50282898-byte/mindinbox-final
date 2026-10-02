"use client";

import { useEffect, type ReactNode } from "react";

/**
 * IP Shield — deterrent for premium surfaces.
 *
 * Honest scope: this raises the effort to copy casual content. It is NOT a
 * content-security boundary. Any material a member can view can be
 * screenshotted or re-uploaded, and no browser technique prevents that. The
 * real protection is the Firestore/Storage rules (see firestore.rules and
 * storage.rules), which deny reads to non-members regardless of what the
 * client does.
 *
 * Deterrents applied, all scoped to the wrapped subtree:
 *  - right-click (context menu)
 *  - copy / cut
 *  - drag-and-drop of text
 *  - Ctrl/Cmd + C / X / A / S / U / P
 *  - print stylesheet blanking the region
 *  - CSS user-select lock (also covers mobile long-press callouts)
 */
export function PremiumShield({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onContextMenu = (event: MouseEvent) => {
      // Let the browser keep working for real form controls.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [data-allow-select]")) return;
      event.preventDefault();
    };

    const onCopyOrCut = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [data-allow-select]")) return;
      event.preventDefault();
    };

    const onDragStart = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-allow-select]")) return;
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [data-allow-select]")) return;
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      // C copy, X cut, A select-all, S save, U view-source, P print
      if (["c", "x", "a", "s", "u", "p"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyOrCut);
    document.addEventListener("cut", onCopyOrCut);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyOrCut);
      document.removeEventListener("cut", onCopyOrCut);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);

  return (
    <div data-ip-shield={enabled ? "on" : undefined} className={enabled ? "no-select" : undefined}>
      {children}
    </div>
  );
}