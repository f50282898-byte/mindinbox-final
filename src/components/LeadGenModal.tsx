"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { addDoc, collection, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function LeadGenModal() {
  const { freeInteractions, setTier, uid, setIdentity } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    if (!auth || !db) {
      setAuthReady(true);
      return;
    }

    return onAuthStateChanged(auth, async (user) => {
      setIdentity(user?.uid ?? null);
      setAuthReady(true);
      if (!user || !db) return;
      try {
        const profile = await getDoc(doc(db, "users", user.uid));
        const profileData = profile.data();
        const profileTier = profileData?.subscriptionTier;
        if (profileTier === "free" || profileTier === "oracle" || profileTier === "sanctum") {
          setTier(profileTier);
        }
      } catch {
        setError("تعذر تحميل ملفك الآن. تحقق من اتصالك وحاول مجدداً.");
      }
    });
  }, []);

  const isVisible = isClient && authReady && !uid && freeInteractions >= 5;

  useEffect(() => {
    if (!isVisible) return;
    const background = document.getElementById("app-content");
    background?.setAttribute("inert", "");
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    focusable()[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog?.focus();
      } else if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      background?.removeAttribute("inert");
      document.removeEventListener("keydown", trapFocus);
    };
  }, [isVisible]);

  const handleLogin = async () => {
    if (!auth || !db) {
      setError("يلزم إعداد Firebase في متغيرات البيئة لتفعيل الدخول.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const now = new Date().toISOString();
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          subscriptionTier: "free",
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "analyticsEvents"), {
          uid: user.uid,
          type: "signup",
          createdAt: now,
        });
      } else {
        const data = userSnap.data();
        if (data.subscriptionTier === "free" || data.subscriptionTier === "oracle" || data.subscriptionTier === "sanctum") {
          setTier(data.subscriptionTier);
        }
      }
      setIdentity(user.uid);
      router.push("/utopia");
    } catch {
      setError("تعذر إكمال الدخول. حاول مرة أخرى.");
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
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-obsidian/90 px-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invitation-title"
            tabIndex={-1}
            className="gold-glow relative w-full max-w-md overflow-hidden rounded-2xl border border-gold/30 bg-[#121212] p-8 text-center shadow-2xl"
          >
            <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-gold/10 blur-3xl" />
            
            <h2 id="invitation-title" className="gold-text-glow font-serif text-3xl text-gold-light">الدعوة الخاصة</h2>
            <p className="mt-4 text-sm leading-relaxed text-gold-muted/80">
              اكتملت لحظاتك الخمس الأولى. واصل رحلتك عبر تسجيل الدخول.
              <br />
              يبدأ حسابك الجديد <strong>تجربة مجانية لمدة 14 يوماً</strong> للتأمل والتتبع اليومي.
            </p>

            <button
              onClick={handleLogin}
              disabled={loading || !firebaseConfigured}
              className="gold-glow mt-8 flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 font-bold text-obsidian transition hover:bg-gold-light disabled:opacity-50"
            >
              {loading ? "جاري فتح البوابة..." : "المتابعة بحساب Google"}
            </button>
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
            {!firebaseConfigured && <p className="mt-4 text-xs text-gold-muted/50">إعداد Firebase غير متاح حالياً.</p>}
            <p className="mt-4 text-[10px] text-gold-muted/40">
              بدخولك، أنت توافق على معاهدة الحكمة الخاصة بنا.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
