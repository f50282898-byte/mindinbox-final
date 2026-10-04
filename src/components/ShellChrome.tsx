"use client";

import { usePathname } from "next/navigation";
import { Shell } from "@/components/Shell";
import { RiddleSession } from "@/components/riddle/RiddleSession";
import { CHROMELESS_ROUTES } from "@/lib/nav";

/**
 * Renders the navigation chrome only on routes that want it.
 *
 * The landing page is deliberately chromeless: no rail, no bottom bar, one
 * button forward. Kept as a client component because deciding on the pathname
 * is the only way to vary chrome per route without duplicating the layout.
 *
 * The riddle session lives here, beside the shell, rather than inside a page. It
 * renders `null` until the server says this reader has won, so it costs nothing on
 * any page — but placing it here means a token can appear wherever the reader
 * happens to be, which is the only behaviour that makes it feel like something
 * found rather than something claimed.
 *
 * On the chromeless landing route there is no session to roll: the reader has not
 * signed in yet, so the roll would be refused anyway. Keeping it out also means the
 * landing page's HTML stays exactly as small as it was designed to be.
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
      <RiddleSession />
    </>
  );
}
