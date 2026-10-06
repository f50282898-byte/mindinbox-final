const fs = require('fs');
const content = `"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

/**
 * View Transitions wrapper with fallback.
 *
 * Uses the View Transitions API for same-document transitions when available,
 * with a CSS-based fallback for browsers that don't support it.
 *
 * The approach:
 * 1. On navigation, we capture the current state
 * 2. If View Transitions API is supported, use document.startViewTransition()
 * 3. Fallback: CSS-based crossfade using a transitioning overlay
 * 3. Skip for external links, downloads, etc.
 */
export function ViewTransitions() {
  const pathname = usePathname();
  const router = useRouter();
  const lastPathRef = useRef(pathname);
  const transitioningRef = useRef(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    // Check if View Transitions API is supported
    const supportsViewTransitions = typeof document.startViewTransition === "function";

    const handleRouteChange = async () => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      try {
        if (typeof document.startViewTransition === "function") {
          // Use native View Transitions API
          await document.startViewTransition(() => {
            // The navigation has already happened by the time this runs
            // because Next.js handles the navigation
          }).finished;
        } else {
          // Fallback: CSS-based crossfade
          await fallbackTransition();
        }
      } finally {
        transitioningRef.current = false;
      }
    };

    // Listen for route changes
    lastPathRef.current = pathname;

    // For View Transitions API, we need to intercept navigation
    // This is handled by the ViewTransitionsLink wrapper on links
    // But we can also listen for popstate for browser back/forward
    const handlePopState = () => {
      handleRouteChange();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [pathname]);

  // Fallback transition using CSS crossfade
  const fallbackTransition = async (): Promise<void> => {
    if (typeof document === "undefined") return;

    // Create transition overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = \`
      position: fixed;
      inset: 0;
      background: var(--bg-0);
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms var(--ease-silk);
    \`;
    document.body.appendChild(overlay);

    // Fade in
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    // Wait for fade in
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Fade out
    overlay.style.opacity = "0";
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Cleanup
    overlay.remove();
  };

  return null;
}

// Hook for components that want to trigger transitions manually
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
        });
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
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return; // Let browser handle normally
    }

    e.preventDefault();

    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => {
        if (replace) {
          window.history.replaceState(null, "", href);
        } else {
          window.history.pushState(null, "", href);
        }
        // Trigger Next.js router update
        window.dispatchEvent(new PopStateEvent("popstate"));
      }).finished.catch(() => {});
    } else {
      // Fallback navigation
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
        // Let the component handle the click
        // But also allow native behavior for modifier keys
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (e as React.MouseEvent<HTMLAnchorElement>).button !== 0
        ) {
          return;
        }
        if (onClick) onClick(e);
      }
      className={className}
      href={href}
    >
      {children}
    </a>
  );
}
`;

fs.writeFileSync('src/components/ViewTransitions.tsx', content);
console.log('Fixed ViewTransitions.tsx');