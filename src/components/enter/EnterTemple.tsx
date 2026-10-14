"use client";

import { useSearchParams } from "next/navigation";
import { AuthPanel } from "@/components/AuthPanel";
import { lensById, type Lens } from "@/components/lenses/lensToken";

/**
 * The temple shell for `/enter`.
 *
 * ## The hard rule: `AuthPanel` is untouched
 *
 * Everything that decides anything about an account lives inside `AuthPanel` —
 * the four modes, the Turnstile challenge, the validation, the guest upgrade, and
 * the `router.push("/dialogue")` that follows a successful sign-in. None of it is
 * read, reordered or re-implemented here. This component renders *around* it and
 * reads the URL; it never touches the form's state.
 *
 * That is why the greeting is a sibling of the panel rather than a prop into it.
 * If the panel ever needs the philosopher, that is a deliberate change with a test
 * — not something a wrapper can arrange by proximity.
 *
 * ## What arrives here
 *
 * `?philosopher=` and `?q=`, written by the landing page. The question is echoed
 * back so the reader can see it survived the navigation, which is the only
 * confirmation they get that it was received at all.
 *
 * An unknown philosopher resolves to `null` (`lensById` never falls back), so a
 * stale link shows the neutral entrance rather than greeting someone with a name
 * that does not exist.
 */

export function EnterTemple() {
  const params = useSearchParams();
  const lens: Lens | null = lensById(params.get("philosopher"));
  const question = (params.get("q") ?? "").trim();

  return (
    <div
      className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-5 py-16"
      style={
        { "--lens-accent": lens ? lens.accentVar : "var(--gold-antique)" } as React.CSSProperties
      }
    >
      {/* The same grain the landing uses, so the two surfaces read as one room. */}
      <div aria-hidden="true" className="film-grain absolute inset-0 z-20" />

      {/*
        `aria-live="polite"` is wrong here and deliberately absent: this is not a
        change the reader made on this page, it is a continuation of where they
        came from. Announcing it again would interrupt a screen reader with the
        context it just spoke.
      */}
      {lens && (
        <header className="animate-fade-rise relative z-10 mb-10 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="display-latin mb-3 text-4xl leading-none text-gold-light/80"
          >
            {lens.symbol}
          </span>
          <p className="display-arabic text-sm tracking-wide text-gold-muted/80">
            {lens.nameAr} ينتظرك
          </p>
          <p
            className="display-arabic mt-4 max-w-lg text-base leading-loose text-gold-muted/70"
            style={{ animationDelay: "0.12s" }}
          >
            {lens.lineIsQuote ? `«${lens.lineAr}»` : lens.epithetAr}
          </p>
          {lens.lineIsQuote && lens.attributionAr && (
            <p className="mt-2 text-[11px] tracking-[0.25em] text-ink-3">{lens.attributionAr}</p>
          )}
        </header>
      )}

      {/* The question carried from the landing page. */}
      {question && (
        <aside
          className="relative z-10 mb-10 w-full rounded-2xl border border-gold/20 bg-black/40 px-6 py-5 text-center backdrop-blur-md"
          style={{ animationDelay: "0.2s" }}
        >
          <p className="mb-2 text-[11px] tracking-[0.3em] text-ink-3">تساؤلك الأول</p>
          <p className="display-arabic text-lg leading-loose text-gold-light/90">{question}</p>
        </aside>
      )}

      {!lens && !question && (
        <p className="relative z-10 mb-8 text-center text-[11px] tracking-[0.25em] text-ink-3">
          ادخل، أو تابع كضيف
        </p>
      )}

      {/* The account form itself — unmodified, and the only thing that talks to Firebase. */}
      <div className="relative z-10 w-full">
        <AuthPanel />
      </div>
    </div>
  );
}

export default EnterTemple;