"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

/**
 * ViewTransitions
 * Animate committed content using Apple-grade silk spring physics;
 * Never blocks navigation or delays routing.
 */
export function ViewTransitions() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.getElementById("main");
    if (!main || typeof main.animate !== "function") return;

    const animation = main.animate(
      [
        { opacity: 0.72, transform: "translateY(6px) scale(0.998)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );

    return () => animation.cancel();
  }, [pathname]);

  return null;
}

export function useViewTransition() {
  const router = useRouter();
  const navigate = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      if (options?.replace) router.replace(href);
      else router.push(href);
    },
    [router]
  );
  return { navigate };
}

export function ViewTransitionLink({
  href,
  children,
  replace = false,
  className = "",
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  replace?: boolean;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link href={href} replace={replace} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
