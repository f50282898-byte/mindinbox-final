"use client";

import { useCallback, useState } from "react";
import { auth } from "@/lib/firebase";
import type { AssistantProposal } from "@/lib/admin/assistant";

/**
 * The assistant panel.
 *
 * ## There is no apply button, and that is deliberate
 *
 * A proposal renders as a **diff** — before, after, and why — and the only action
 * offered is to copy the suggested text. There is no "publish", no "apply", no
 * one-click anything.
 *
 * The reasoning is in `lib/admin/assistant.ts`: applying means pasting the text into the
 * ordinary editor and publishing through `/api/admin/site/publish`, which re-checks the
 * admin and writes an audit entry under the human's uid. A button that applied a model's
 * suggestion directly would put a site change in the audit log attributed to someone who
 * never saw it.
 *
 * It also means the panel cannot be misused by someone who finds it and does not
 * understand it. The worst thing it can do is show text.
 */
export function AssistantPanel() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [proposals, setProposals] = useState<AssistantProposal[]>([]);

  const ask = useCallback(async () => {
    if (question.trim().length < 3) return;
    setBusy(true);
    setNote(null);

    const user = auth?.currentUser;
    if (!user) {
      setBusy(false);
      setNote("انتهت الجلسة.");
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questionAr: question.trim(), days: 7 }),
      });

      if (!res.ok) {
        setNote("تعذّر سؤال المساعد.");
        return;
      }

      const data = (await res.json()) as {
        available: boolean;
        message?: string;
        note?: string;
        proposals: AssistantProposal[];
      };

      setAvailable(data.available);
      setProposals(data.proposals ?? []);
      setNote(
        data.available
          ? (data.note ?? null)
          : (data.message ?? "المساعد غير متاح حالياً.")
      );
    } catch {
      setNote("تعذّر سؤال المساعد.");
    } finally {
      setBusy(false);
    }
  }, [question]);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="assistant-question" className="text-xs text-gold-muted">
        سؤالك
      </label>
      <textarea
        id="assistant-question"
        dir="rtl"
        rows={2}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="لماذا هبط التحويل؟"
        className="w-full rounded-lg border border-white/15 bg-black/40 p-3 text-sm text-gold-light outline-none focus:border-accent-solid/60"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={ask}
          disabled={busy || question.trim().length < 3}
          className="rounded-lg border border-accent-solid/60 px-4 py-2 text-sm text-accent-solid disabled:opacity-40"
        >
          {busy ? "جارٍ…" : "اسأل"}
        </button>
        <p className="text-xs text-gold-muted/60">
          يقرأ أرقاماً مجمّعة وإعدادات فقط. لا يقرأ محادثات أو يوميات.
        </p>
      </div>

      {note && (
        <p role="status" className="text-sm text-gold-light">
          {note}
        </p>
      )}

      {available === false && (
        <p className="rounded-lg border border-white/10 p-3 text-xs text-gold-muted/70">
          لم يُضبط مزوّد ذكاء في هذه البيئة، فيُرجَع ردّ فارغ بدل إجابة مُختلقة. هذا مقصود:
          تحليل قمع التحويل المُختلق أسوأ من «غير متاح».
        </p>
      )}

      {proposals.length > 0 && (
        <ul className="flex flex-col gap-3">
          {proposals.map((p) => (
            <li key={p.path} className="rounded-xl border border-white/10 p-3">
              <p dir="ltr" className="text-xs text-gold-muted/60">
                {p.path}
              </p>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 p-2">
                  <p className="text-xs text-gold-muted/60">قبل</p>
                  <p dir="auto" className="mt-1 text-gold-muted">
                    {p.before}
                  </p>
                </div>
                <div className="rounded-lg border border-accent-solid/30 p-2">
                  <p className="text-xs text-gold-muted/60">بعد</p>
                  <p dir="auto" className="mt-1 text-gold-light">
                    {p.after}
                  </p>
                </div>
              </div>
              {p.rationaleAr && (
                <p dir="auto" className="mt-2 text-xs leading-relaxed text-gold-muted/80">
                  {p.rationaleAr}
                </p>
              )}
              <p className="mt-2 text-xs text-gold-muted/60">
                انسخ النصّ إلى المحرّر، ثم انشر بنفسك. لا يوجد تطبيق آلي.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
