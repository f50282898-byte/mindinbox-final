"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

/**
 * View Transitions wrapper with fallback.
 *
 * Uses the View Transitions API for same-document transitions when available,
 * with a CSS-based fallback for browsers that don't support it.
 *
 * Transitions are kept fast (220ms) so navigation feels instant and premium —
 * like a single-page application, not a document reload.
 */
export function ViewTransitions() {
  const pathname = usePathname();
  const lastPathRef = useRef(pathname);
  const transitioningRef = useRef(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    const handleRouteChange = async () => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      try {
        if (typeof document.startViewTransition === "function") {
          await document.startViewTransition(() => {
            // The navigation has already happened by the time this runs
            // because Next.js handles the navigation
          }).finished;
        } else {
          await fallbackTransition();
        }
      } finally {
        transitioningRef.current = false;
      }
    };

    lastPathRef.current = pathname;

    const handlePopState = () => {
      handleRouteChange();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [pathname]);

  // Fallback transition using CSS crossfade — fast and premium
  const fallbackTransition = async (): Promise<void> => {
    if (typeof document === "undefined") return;

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: var(--bg-0);
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 220ms var(--ease-silk);
    `;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    await new Promise((resolve) => setTimeout(resolve, 110));

    overlay.style.opacity = "0";
    await new Promise((resolve) => setTimeout(resolve, 220));

    overlay.remove();
  };

  return null;
}

/**
 * Hook for components that want to trigger transitions manually
 */
export function useViewTransition() {
  const router = useRouter();

  const navigate = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      if (typeof document.startViewTransition === "function") {
        document.startViewTransition(() => {
          if (options?.replace) {
            router.replace(href);
          } else {
            router.push(href);
          }
        }).finished.catch(() => {});
      } else {
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      }
    },
    [router]
  );

  return { navigate };
}

/**
 * Wrapper for Link components that enables View Transitions.
 * Usage: <ViewTransitionLink href="/path">Link</ViewTransitionLink>
 */
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
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    e.preventDefault();

    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        if (replace) {
          window.history.replaceState(null, "", href);
        } else {
          window.history.pushState(null, "", href);
        }
        window.dispatchEvent(new PopStateEvent("popstate"));
      }).finished.catch(() => {});
    } else {
      if (replace) {
        window.history.replaceState(null, "", href);
      } else {
        window.history.pushState(null, "", href);
      }
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <a
      href={href}
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        ) {
          return;
        }
        handleClick(e);
        if (onClick) onClick(e);
      }}
      className={className}
      style={{ viewTransitionName: "navigate" }}
    >
      {children}
    </a>
  );
}
