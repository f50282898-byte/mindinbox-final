"use client";

import { useEffect, type ReactNode } from "react";

export function PremiumContentShield({ children }: { children: ReactNode }) {
  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", blockContextMenu);
    return () => document.removeEventListener("contextmenu", blockContextMenu);
  }, []);

  return <div className="premium-content">{children}</div>;
}
