"use client";

import { usePathname } from "next/navigation";
import { DesktopHeader, MobileHeader, MobileBottomBar } from "@/components/Header";
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

  /*
    Exactly one `<main>` per document, in both branches.

    This component is the single owner of the main landmark. The root layout used
    to render a second `<main id="main">` of its own, which produced two elements
    sharing the id on every non-chromeless route — and left the chromeless branch
    with none, because it returned `children` bare. Pages must therefore render a
    plain `<div>` and never their own `<main>`.

    `id="main"` is also the target of the skip-link in `layout.tsx`; a duplicate
    made that link resolve to whichever copy came first in the DOM.
  */
  if (chromeless) {
    return (
      <main id="main" className="shell-content min-h-screen pb-24 md:pb-0 overflow-x-hidden">
        {children}
        <MobileBottomBar />
      </main>
    );
  }

  return (
    <>
      <DesktopHeader />
      <MobileHeader />
      <main id="main" className="shell-content min-h-screen pt-16 pb-28 md:pb-0 overflow-x-hidden">
        {children}
        <MobileBottomBar />
      </main>
      <Footer />
    </>
  );
}