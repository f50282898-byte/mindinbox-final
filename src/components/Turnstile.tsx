"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing when no site key is configured, and reports success in that
 * case ONLY because the server endpoint will then refuse every request — the
 * gate fails closed, so an unconfigured deployment cannot be signed up through.
 *
 * The widget is an explicit user challenge rather than an invisible one: signup
 * is infrequent and a silent checkbox that fires on its own trains people to
 * wave past challenges on the actions that matter.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          "timeout-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({
  onToken,
  resetSignal = 0,
}: {
  /** Receives the single-use response token, or null when it lapses. */
  onToken: (token: string | null) => void;
  /** Increment to force a fresh challenge. */
  resetSignal?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  // The explicit-render API is loaded on demand rather than in the document
  // head, so no page other than signup pays for it.
  useEffect(() => {
    if (!siteKey) return;
    if (window.turnstile) return;
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => setScriptFailed(true);
    document.head.appendChild(script);
  }, [siteKey]);

  const render = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current !== null) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "dark",
      size: "normal",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
      "timeout-callback": () => onToken(null),
    });
  }, [siteKey, onToken]);

  useEffect(() => {
    if (!siteKey) return;
    if (window.turnstile) {
      render();
      return;
    }
    // Poll briefly rather than guessing at script load ordering.
    const id = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(id);
        render();
      }
    }, 120);
    const stop = window.setTimeout(() => window.clearInterval(id), 15_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [siteKey, render]);

  // Re-challenge when the caller signals a previous attempt failed.
  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onToken(null);
    }
  }, [resetSignal, onToken]);

  useEffect(
    () => () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    },
    []
  );

  if (!siteKey) return null;

  return (
    <div className="min-h-[65px]">
      <div ref={containerRef} />
      {scriptFailed && (
        <p role="alert" className="text-sm text-gold-light">
          تعذّر تحميل التحقق الأمني. تحقّق من اتصالك ثم أعد المحاولة.
        </p>
      )}
    </div>
  );
}
