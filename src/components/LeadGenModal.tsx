"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { auth, db } from "@/lib/firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function LeadGenModal() {
  const { freeInteractions, setTier } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isVisible = isClient && freeInteractions >= 5;

  const handleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 14);

        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          tier: "free",
          trialEnd: trialEndDate.toISOString(),
          createdAt: new Date().toISOString(),
        });
      } else {
        const data = userSnap.data();
        if (data.tier) setTier(data.tier);
      }
      
      router.push("/utopia");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 px-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="gold-glow relative w-full max-w-md overflow-hidden rounded-2xl border border-gold/30 bg-[#0a0a0a] p-8 text-center shadow-2xl"
          >
            <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-gold/10 blur-3xl" />
            <h2 className="gold-text-glow font-serif text-3xl text-gold-light">البوابة (The Gate)</h2>
            <p className="mt-4 text-sm leading-relaxed text-gold-muted/80">
              لقد استنفدت تفاعلاتك العابرة. الحكمة العميقة تتطلب التزاماً.
              <br />
              سجل الآن لتحصل على <strong>نسخة تجريبية لمدة 14 يوماً</strong> لفتح بوابة "المدينة الفاضلة".
            </p>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="gold-glow mt-8 flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 font-bold text-black transition hover:bg-gold-light disabled:opacity-50"
            >
              {loading ? "جاري فتح البوابة..." : "قبول الدعوة (الدخول بحساب جوجل)"}
            </button>
            <p className="mt-4 text-[10px] text-gold-muted/40">
              بدخولك، أنت توافق على معاهدة الحكمة الخاصة بنا.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
