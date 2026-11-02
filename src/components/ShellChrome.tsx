"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DesktopHeader, MobileHeader } from "@/components/Header";
import { MobileBottomBar } from "@/components/MobileBottomBar";
import { Footer } from "@/components/Footer";
import { CHROMELESS_ROUTES } from "@/lib/nav";

/**
 * ShellChrome
 *
 * Controls layout chrome per route.
 * Invariants:
 * 1. Single <main id="main"> landmark across all routes (T1.1.1).
 * 2. Client hydration handshake data-hydrated="1" (T1.1.2).
 * 3. Skip-link destination resolves to #main with proper tabIndex={-1} (T1.1.3).
 * 4. Silk spring view transitions on navigation.
 */
export function ShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless = CHROMELESS_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );

  // Redundant client hydration handshake guarantee (T1.1.2)
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.hydrated = "1";
    }
  }, []);

  // Apple-grade silk spring view transition animation on route changes
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const main = document.getElementById("main");
    if (!main || typeof main.animate !== "function") return;

    const animation = main.animate(
      [
        { opacity: 0.72, transform: "translateY(6px) scale(0.998)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      {
        duration: 220,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    );

    return () => animation.cancel();
  }, [pathname]);

  if (chromeless) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="shell-content min-h-screen pb-24 md:pb-0 overflow-x-hidden outline-none"
      >
        {children}
        <MobileBottomBar />
      </main>
    );
  }

  return (
    <>
      <DesktopHeader />
      <MobileHeader />
      <main
        id="main"
        tabIndex={-1}
        className="shell-content min-h-screen pt-20 pb-28 md:pb-0 overflow-x-hidden outline-none"
      >
        {children}
        <MobileBottomBar />
      </main>
      <Footer />
    </>
  );
}