"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, paths } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";
import { TRIAL_DAYS, TIER_DEFINITIONS, type Tier } from "@/lib/tiers";
import { GoldDust } from "@/components/GoldDust";

/**
 * The Gate — appears on the sixth anonymous attempt.
 *
 * Signup writes a profile document whose shape matches `firestore.rules`
 * exactly. The previous implementation wrote `tier` + `trialEnd` + an ISO
 * `createdAt`, which the rules reject on all three counts, so signup silently
 * failed and the member never became a member.
 */
export function GateModal({ open }: { open: boolean }) {
  const closeGate = useAppStore((s) => s.closeGate);
  const setMembership = useAppStore((s) => s.setMembership);
  const attemptsLeft = useAppStore((s) => s.attemptsLeft);
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes (the Gate is a modal, not a wall).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeGate]);

  const signIn = async () => {
    if (!auth || !db) {
      setError("تعذّر تجهيز تسجيل الدخول. تحقّق من إعدادات Firebase.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      const user = credential.user;
      const ref = doc(db, paths.user(user.uid));
      const existing = await getDoc(ref);

      if (!existing.exists()) {
        // Mirrors firestore.rules: exactly these keys, server-side createdAt,
        // and a trialEnd bounded by the rules to [now, now + TRIAL_DAYS].
        await setDoc(ref, {
          email: user.email ?? null,
          displayName: user.displayName ?? null,
          subscriptionTier: "free" as Tier,
          createdAt: serverTimestamp(),
          trialEnd: Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 86_400_000),
        });
      }

      const data = existing.exists() ? existing.data() : null;
      const tier = (data?.subscriptionTier as Tier | undefined) ?? "free";
      setMembership(tier, (data?.trialEnd as unknown as string | undefined) ?? null);

      closeGate();
      router.push("/tracker");
    } catch (caught) {
      const code = (caught as { code?: string })?.code ?? "";
      if (code === "auth/popup-closed-by-user") {
        setError("أُلغيت النافذة. يمكنك العودة متى شئت.");
      } else if (code === "auth/popup-blocked") {
        setError("حجب المتصفح النافذة المنبثقة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
      } else {
        setError("تعذّر إتمام التسجيل. حاول مرة أخرى.");
      }
    } finally {
      setBusy(false);
    }
  };

  const oracle = TIER_DEFINITIONS.oracle;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-volcanic/92 px-4 py-8 backdrop-blur-xl"
        >
          <button
            type="button"
            aria-label="إغلاق البوابة"
            onClick={closeGate}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 26 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong relative w-full max-w-lg overflow-hidden rounded-3xl p-8 text-center sm:p-10"
          >
            <GoldDust count={18} />

            <p className="relative text-[10px] tracking-[0.35em] text-gold-muted/60">
              THE GATE · البوابة
            </p>

            <h2
              id="gate-title"
              className="gold-text-glow display-arabic relative mt-4 text-3xl font-bold text-gold-light sm:text-4xl"
            >
              الحكمة العميقة تتطلب التزاماً
            </h2>

            <p className="relative mt-5 text-sm leading-relaxed text-gold-muted/80">
              {attemptsLeft === 0
                ? "استنفدت محاولاتك العابرة."
                : "محاولاتك العابرة على وشك الانتهاء."}{" "}
              سجّل دخولك لتفتح <strong className="text-gold-light">{TRIAL_DAYS} يوماً</strong> من
              الحكمة الكاملة — بلا بطاقة، وبلا التزام.
            </p>

            <div className="relative my-7">
              <div className="hairline" />
            </div>

            <ul className="relative space-y-2.5 text-start text-sm text-gold-muted/85">
              {oracle.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.9)]"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={signIn}
              disabled={busy}
              className="btn-gold mt-8 w-full"
            >
              <span>{busy ? "جارٍ فتح البوابة…" : "اقبل الدعوة — دخول بحساب جوجل"}</span>
            </button>

            {error && (
              <p role="alert" className="relative mt-4 text-xs leading-relaxed text-red-300/85">
                {error}
              </p>
            )}

            <p className="relative mt-5 text-[11px] leading-relaxed text-gold-muted/45">
              بدخولك توافق على معاهدة الحكمة. لا نخزّن أي بيانات مالية.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}