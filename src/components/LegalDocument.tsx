import type { ReactNode } from "react";

/**
 * Shared shell for the three legal documents.
 *
 * Two deliberate choices:
 *
 * 1. The draft notice is the *first* line, not a footer. Anyone reading must
 *    not have to scroll to discover the text has not been through a lawyer.
 *
 * 2. Both languages render in the same document rather than behind a toggle.
 *    These are terms, not interface copy — splitting them hides half of what
 *    the reader is agreeing to, and the language toggle is chrome, not a
 *    consent mechanism. Arabic comes first because it is the primary language.
 */

export interface LegalSection {
  id: string;
  /** Arabic heading, shown first. */
  headingAr: string;
  headingEn: string;
  /** Paragraphs, rendered in order, Arabic then English per paragraph. */
  paragraphs: { ar: string; en: string }[];
  /** Optional bulleted list of specific items. */
  items?: { ar: string; en: string }[];
}

export function LegalDraftNotice() {
  return (
    <aside
      role="note"
      className="mb-8 rounded-2xl border border-gold/35 bg-gold/[0.07] p-5"
    >
      <p className="display-arabic text-base font-bold text-gold-light">
        مسودة — تحتاج مراجعة قانونية قبل الإطلاق.
      </p>
      <p className="display-arabic mt-2 text-sm leading-relaxed text-gold-muted">
        هذه الصياغة أُعدّت كمسودة أولى ولم تُراجَع من محامٍ. لا تعتمد عليها في قرار
        شرعي أو تجاري قبل اعتمادها من مستشار قانوني في ولايتك القضائية.
      </p>
      <p className="mt-4 border-t border-gold/20 pt-3 text-sm leading-relaxed text-gold-muted">
        <strong className="font-semibold text-gold-light">DRAFT — requires legal review before launch.</strong>{" "}
        This wording was prepared as a first draft and has not been reviewed by a qualified lawyer. Do not
        rely on it for any legal or commercial decision before it is reviewed for your jurisdiction.
      </p>
    </aside>
  );
}

export function LegalDocument({
  titleAr,
  titleEn,
  updatedAr,
  updatedEn,
  sections,
  children,
}: {
  titleAr: string;
  titleEn: string;
  updatedAr: string;
  updatedEn: string;
  sections: LegalSection[];
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="display-arabic text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          {titleAr}
        </h1>
        <p className="display-latin mt-1 text-lg text-gold-muted/80">{titleEn}</p>
        <p className="mt-4 text-xs tracking-wide text-ink-3">
          {updatedAr} · {updatedEn}
        </p>
      </header>

      <LegalDraftNotice />

      <nav aria-label="أقسام هذه الوثيقة · Sections in this document" className="mb-10">
        <ol className="flex flex-col gap-1.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-gold-muted underline-offset-4 transition-colors hover:text-gold-light hover:underline"
              >
                <span className="display-arabic">{s.headingAr}</span>
                <span className="mx-2 text-ink-3">/</span>
                <span className="display-latin text-gold-muted/70">{s.headingEn}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-8">
            <h2 className="display-arabic mb-3 text-xl font-bold text-gold-light">
              <span className="me-2 text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              {s.headingAr}
            </h2>
            <p className="display-latin mb-3 text-sm text-gold-muted/65">{s.headingEn}</p>

            {s.paragraphs.map((p, j) => (
              <div key={j} className="mb-4">
                <p className="display-arabic text-[0.975rem] leading-loose text-gold-muted">
                  {p.ar}
                </p>
                <p className="display-latin mt-1.5 text-sm leading-relaxed text-gold-muted/65">
                  {p.en}
                </p>
              </div>
            ))}

            {s.items && (
              <ul className="my-4 flex flex-col gap-2.5 border-s-2 border-gold/25 ps-4">
                {s.items.map((it, j) => (
                  <li key={j}>
                    <p className="display-arabic text-[0.95rem] leading-loose text-gold-muted">{it.ar}</p>
                    <p className="display-latin text-sm leading-relaxed text-gold-muted/60">{it.en}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {children ? <div className="mt-12">{children}</div> : null}
    </div>
  );
}
