"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

/** Animate committed content; never replace Next's navigation or block a route on animation. */
export function ViewTransitions() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.getElementById("main");
    if (!main || typeof main.animate !== "function") return;
    const animation = main.animate([{ opacity: 0.65, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
    return () => animation.cancel();
  }, [pathname]);
  return null;
}
export function useViewTransition() {
  const router = useRouter();
  const navigate = useCallback((href: string, options?: { replace?: boolean }) => {
    if (options?.replace) router.replace(href); else router.push(href);
  }, [router]);
  return { navigate };
}
export function ViewTransitionLink({ href, children, replace = false, className = "", onClick }: {
  href: string; children: React.ReactNode; replace?: boolean; className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return <Link href={href} replace={replace} className={className} onClick={onClick}>{children}</Link>;
}
