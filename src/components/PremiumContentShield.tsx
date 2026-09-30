"use client";
import { useEffect } from "react";

export function PremiumContentShield({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // IP Shield: Prevent right-click and copy
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleCopy = (e: ClipboardEvent) => e.preventDefault();
    
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
    };
  }, []);

  return (
    <div className="select-none pointer-events-auto">
      {children}
    </div>
  );
}
