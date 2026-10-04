"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * The gate.
 *
 * Copy rules this component exists to enforce:
 *  - an **invitation**, not a wall. No scarcity, no countdown, no "seats left",
 *    no exclamation. The product's premise is calm; a pressure screen would
 *    contradict everything around it.
 *  - the free trial is stated as a fact, with its length, before the ask.
 *  - "later" is given **equal visual weight** to the signup button. A dismiss
 *    that looks like a smaller, greyer afterthought is not a real choice, and
 *    the brief asks for equal prominence rather than merely a dismiss button.
 *  - it never appears for a crisis reply. The route returns before metering,
 *    so a GATE cannot be raised for someone in distress; this dialog only
 *    responds to `open`.
 */

export function GateDialog({
  open,
  onClose,
  remaining,
}: {
  open: boolean;
  onClose: () => void;
  /** Never rendered as pressure â€” shown as context only. */
  remaining?: number | null;
}) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = panelRef.current;
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Focus the panel, not the primary action: landing on "create account" makes
    // the dismiss feel unavailable.
    (node ?? document.body).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-volcanic/88 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="glass-strong relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="absolute end-4 top-4 flex size-9 items-center justify-center rounded-full border border-gold/25 text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        {/* Fixed aspect box so the image cannot push the copy around (CLS). */}
        <div className="relative mx-auto aspect-square w-32 overflow-hidden rounded-full sm:w-40">
          <Image
            src="/gate.png"
            alt=""
            width={320}
            height={320}
            className="h-full w-full object-cover"
            priority
          />
        </div>

        <h2 id={titleId} className="display-arabic mt-6 text-center text-2xl font-bold text-gold-light">
          الباب مفتوح
        </h2>

        <div id={bodyId} className="display-arabic mt-4 space-y-3 text-center leading-loose">
          <p className="text-[0.95rem] text-gold-muted">
            استخدمت محاولاتك المجانية. هذا كل ما نفرضه قبل أن تقرر.
          </p>
          <p className="text-[0.95rem] text-gold-muted">
            إذا أنشأت حساباً، تفتح لك <strong className="text-gold-light">أربعة عشر يوماً</strong>{" "}
            كاملة بلا حدود — لا بطاقة، ولا تجديد تلقائي، ولا رقم بطاقة.
          </p>
          <p className="text-[0.95rem] text-gold-muted">
            وبعدها إن أحببت أن تبقى، فالأمر بين يديك. وإن لم تحب، فمحادثاتك التي كتبتها لك
            وما زالت عندك.
          </p>
        </div>

        {/* Both actions at the same weight: this is a genuine choice. */}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1 px-6 py-3.5 text-sm font-semibold"
          >
            لاحقاً
          </button>
          <Link
            href="/enter?mode=signup"
            onClick={onClose}
            className="btn-gold flex-1 px-6 py-3.5 text-center text-sm font-semibold"
          >
            أنشئ حسابي — 14 يوماً مجاناً
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-ink-3">
          {remaining !== null && remaining !== undefined
            ? `لديك ${remaining} من المحاولات المجانية.`
            : "لا نطلب بطاقة، ولا نُعيد توجيهك إلى الدفع."}
        </p>
      </div>
    </div>
  );
}

export default GateDialog;
