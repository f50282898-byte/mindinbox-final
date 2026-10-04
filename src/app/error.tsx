"use client";

import { useEffect } from "react";
import { log } from "@/lib/log";

export const runtime = "edge";

/**
 * Route-level error boundary.
 *
 * Logs the error through the redacting logger — never the raw thrown value,
 * which can contain user text from the failed render — and shows the visitor
 * something honest. No stack traces, no internal identifiers.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `log` redacts and is a no-op outside development for non-errors.
    log.error("route_error", { digest: error.digest ?? null });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="display-latin text-xs tracking-[0.3em] text-gold-muted/40">ERROR</p>
      <h1 className="display-arabic mt-4 text-3xl font-bold text-gold-light">
        حدث خطأ في هذه الصفحة
      </h1>
      <p className="mt-3 leading-relaxed text-gold-muted/70">
        Something went wrong on this page. Your writing has not been lost.
      </p>
      {error.digest && (
        <p className="mt-4 text-xs text-gold-muted/40">
          Reference for support: <span className="display-latin">{error.digest}</span>
        </p>
      )}
      <button type="button" onClick={reset} className="btn-gold mt-9 px-8 py-3 text-sm">
        حاول مرة أخرى
      </button>
    </div>
  );
}
