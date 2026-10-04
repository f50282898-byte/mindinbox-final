"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

/**
 * The «فحص التطابق» button.
 *
 * ## What the result is allowed to say
 *
 * The route reports `checked: "display"` when no card is linked to a payment price,
 * and the panel renders that word. It does not say "everything matches" — because it
 * has only compared a display string against a constant, and no payment path exists to
 * compare against. An admin reading "مطابق" would reasonably believe the live amount was
 * checked, and it was not.
 *
 * ## The link field is separate from the price field
 *
 * A card can carry a `priceId` before billing exists. Editing the displayed number and
 * linking it to a provider price are different acts, and conflating them is how a site
 * ends up charging 19 while advertising 9.
 */
export function PricingCheck() {
  const [cards, setCards] = useState<
    Array<{ tier: string; price: { ar: string; en: string }; priceId: string | null }> | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{
    checked: "display" | "display+provider";
    findings: Array<{ tier: string; problem: string; detailAr: string }>;
    linkedPriceIds: string[];
  } | null>(null);

  const load = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/site", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        content: { pricing: typeof cards };
      };
      setCards(data.content.pricing ?? null);
    } catch {
      setCards(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const check = useCallback(async () => {
    if (!cards) return;
    setBusy(true);
    const user = auth?.currentUser;
    if (!user) {
      setBusy(false);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/pricing/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          cards: cards.map((c) => ({ tier: c.tier, price: c.price, priceId: c.priceId })),
        }),
      });
      if (!res.ok) {
        setReport({
          checked: "display",
          findings: [{ tier: "—", problem: "check_failed", detailAr: "تعذّر الفحص." }],
          linkedPriceIds: [],
        });
        return;
      }
      const data = (await res.json()) as { report: NonNullable<typeof report> };
      setReport(data.report);
    } catch {
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [cards]);

  if (!cards) {
    return (
      <p role="status" className="text-sm text-gold-muted/70">
        جارٍ التحميل…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {cards.map((card, index) => (
          <li key={card.tier} className="flex flex-wrap items-center gap-2 text-sm">
            <span dir="ltr" className="w-20 text-xs text-gold-muted/60">
              {card.tier}
            </span>
            <label className="sr-only" htmlFor={`price-ar-${card.tier}`}>
              السعر المعروض بالعربية
            </label>
            <input
              id={`price-ar-${card.tier}`}
              dir="rtl"
              value={card.price.ar}
              onChange={(e) =>
                setCards(
                  cards.map((c, i) =>
                    i === index ? { ...c, price: { ...c.price, ar: e.target.value } } : c
                  )
                )
              }
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-gold-light outline-none focus:border-accent-solid/60"
            />
            <label className="sr-only" htmlFor={`price-en-${card.tier}`}>
              السعر المعروض بالإنجليزية
            </label>
            <input
              id={`price-en-${card.tier}`}
              dir="ltr"
              value={card.price.en}
              onChange={(e) =>
                setCards(
                  cards.map((c, i) =>
                    i === index ? { ...c, price: { ...c.price, en: e.target.value } } : c
                  )
                )
              }
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-gold-light outline-none focus:border-accent-solid/60"
            />
            <label className="sr-only" htmlFor={`priceid-${card.tier}`}>
              معرّف السعر عند المزوّد
            </label>
            <input
              id={`priceid-${card.tier}`}
              dir="ltr"
              placeholder="price id"
              value={card.priceId ?? ""}
              onChange={(e) =>
                setCards(
                  cards.map((c, i) =>
                    i === index ? { ...c, priceId: e.target.value || null } : c
                  )
                )
              }
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-gold-muted outline-none focus:border-accent-solid/60"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className="rounded-lg border border-accent-solid/60 px-4 py-2 text-sm text-accent-solid disabled:opacity-40"
        >
          {busy ? "جارٍ الفحص…" : "فحص التطابق"}
        </button>
      </div>

      {report && (
        <div className="rounded-xl border border-white/10 p-3 text-xs">
          <p className="text-gold-muted">
            نطاق الفحص:{" "}
            <strong className="text-gold-light">
              {report.checked === "display+provider" ? "المعروض والمزوّد" : "المعروض فقط"}
            </strong>
            {report.checked === "display" && (
              <span className="block text-gold-muted/70">
                لا يوجد مسار دفع بعد، فلم يُقارَن المبلغ عند مزوّد الدفع. هذا الفحص يقارن
                النصّ المعروض بالسعر الحقيقي في الكود فقط.
              </span>
            )}
          </p>

          {report.findings.length === 0 ? (
            <p className="mt-2 text-gold-light">لم يُرصد اختلاف ضمن النطاق الذي فُحص.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {report.findings.map((f) => (
                <li key={`${f.tier}-${f.problem}`} className="text-gold-light">
                  <span dir="ltr" className="text-gold-muted/60">
                    {f.tier}
                  </span>{" "}
                  — {f.detailAr}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
