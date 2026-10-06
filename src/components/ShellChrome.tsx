"use client";

import { usePathname } from "next/navigation";
import { DesktopHeader, MobileHeader } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CHROMELESS_ROUTES } from "@/lib/nav";

/**
 * Renders the navigation chrome only on routes that want it.
 *
 * The landing page is deliberately chromeless: no header, no footer, one
 * button forward. Kept as a client component because deciding on the pathname
 * is the only way to vary chrome per route without duplicating the layout.
 */
export function ShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless = CHROMELESS_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );

  if (chromeless) return <>{children}</>;

  return (
    <>
      <DesktopHeader />
      <MobileHeader />
      <main id="main" className="shell-content min-h-screen pt-16 pb-24 md:pb-0">
        {children}
      </main>
      <Footer />
    </>
  );
}