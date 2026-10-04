"use client";

import { useEffect } from "react";
import {
  firebaseConfigReport,
  isFirebaseConfigured,
} from "@/lib/firebase/config";

/**
 * The calm screen shown where a feature needs Firebase and Firebase is absent.
 *
 * ## What the reader is told
 *
 * That this part of the product is not available right now, and nothing else. No
 * variable names, no "not configured in this build", no apology, no ticket number.
 *
 * This is a deliberate reversal of the previous wording, which read:
 *
 * > Sign-in is not configured in this build yet. The Firebase settings come from
 * > environment variables, which are absent.
 *
 * That sentence was addressed to a deployer, on a public page. It was two problems at
 * once. It told a visitor that the thing in front of them is unfinished, which is a
 * credibility cost the product cannot recover from cheaply; and it told anyone reading
 * that the client is missing `NEXT_PUBLIC_FIREBASE_*`, which is a map of the exact keys
 * worth stealing. Handing an attacker the variable names to go and look up is not a
 * cosmetic problem.
 *
 * So: the diagnosis moves to the console, once, for the developer who has the console
 * open. The page states the absence and offers a route that works.
 *
 * ## noindex is applied by the page, not here
 *
 * This component cannot set metadata. `/enter`, `/tracker` and `/journal` export
 * `robots: { index: false }` in their own `metadata`, which is the only place Next will
 * read it — a `noindex` added by a client component arrives after the crawler has
 * already decided. The list of affected routes lives in `./routes`, which the pages and
 * `sitemap.ts` both read, so they cannot disagree about which routes those are.
 */

/**
 * Logs the real diagnosis once, to the console only.
 *
 * Development and console inspection are the two legitimate audiences, and both have a
 * console. It logs the **names** of missing keys, never their values — a `console.log`
 * of the environment is a secret leak waiting for a screen share.
 */
export function useFirebaseNotice(where: string): boolean {
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (configured) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("miab-fb-notice") === where) return;
    sessionStorage.setItem("miab-fb-notice", where);

    const report = firebaseConfigReport();
    // eslint-disable-next-line no-console -- developer-facing, names no values
    console.warn(
      `[mind-in-a-box] ${where}: Firebase is not configured, so this surface is ` +
        `showing its unavailable state.\n` +
        `  missing (required): ${report.missingRequired.join(", ") || "none"}\n` +
        `  missing (optional): ${report.missingOptional.join(", ") || "none"}\n` +
        `  Set these as plain-text variables for the target environment, then rebuild. ` +
        `NEXT_PUBLIC_* values are inlined at build time, so adding them to a running ` +
        `deployment does nothing until it is redeployed.`,
    );
  }, [configured, where]);

  return configured;
}

/**
 * The unavailable screen.
 *
 * Tone is the constraint. No exclamation, no red, no "error". The page is calm and the
 * copy is plain, because a visitor did not break anything and should not feel they
 * had. Where a working alternative exists it is offered as a plain link — an
 * alternative that does not work would be worse than none.
 */
export function FirebaseRequired({
  title,
  children,
}: {
  /** Short, honest, no technical vocabulary. */
  title: string;
  /** One sentence of consequence, or a route out. */
  children?: React.ReactNode;
}) {
  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-16"
      aria-labelledby="fb-required-heading"
    >
      <div className="glass p-7">
        <h1
          id="fb-required-heading"
          className="display-arabic text-2xl font-bold text-gold-light"
        >
          {title}
        </h1>
        <div className="display-arabic mt-4 leading-loose text-gold-muted">{children}</div>
        <p className="display-latin mt-5 text-sm leading-relaxed text-gold-muted/60">
          This part is not available right now. The rest of the app is — nothing you have
          already saved is affected.
        </p>
        <a
          href="/wisdom"
          className="display-arabic mt-6 inline-block text-gold-light underline underline-offset-4"
        >
          إلى الحكمة
        </a>
      </div>
    </section>
  );
}