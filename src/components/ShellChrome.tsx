"use client";

import { usePathname } from "next/navigation";
import { Shell } from "@/components/Shell";
import { CHROMELESS_ROUTES } from "@/lib/nav";

/**
 * Renders the navigation chrome only on routes that want it.
 *
 * The landing page is deliberately chromeless: no rail, no bottom bar, one
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
      <Shell />
      {children}
    </>
  );
}
