"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { X } from "lucide-react";

export function InternalAdEngine() {
  const [isVisible, setIsVisible] = useState(false);
  const [adMessage, setAdMessage] = useState("");
  const { subscriptionTier } = useAppStore();

  useEffect(() => {
    // Only show ads to free users
    if (subscriptionTier !== 'free') return;

    const ads = [
      "عقول العظماء لا تنتظر أحداً. ارتقِ إلى طبقة 'العرّاف' (Oracle) الآن.",
      "الحكمة العميقة تتطلب التزاماً حقيقياً. افتح أبواب 'المحراب' (Sanctum) واكتشف ما وراء الحجاب.",
      "ما الفائدة من البصيرة إن لم تحولها إلى واقع؟ اكتشف التحليل الفلسفي اليومي الآن."
    ];

    const lastSeen = localStorage.getItem('lastAdSeen');
    const now = new Date().getTime();
    
    // Rotate every 3 days (3 * 24 * 60 * 60 * 1000)
    // For demo purposes, we'll show it if it hasn't been seen today
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    
    if (!lastSeen || now - parseInt(lastSeen) > THREE_DAYS) {
      const adIndex = Math.floor(now / THREE_DAYS) % ads.length;
      setAdMessage(ads[adIndex]);
      
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 5000); // Show after 5 seconds of loading the app
      
      return () => clearTimeout(timer);
    }
  }, [subscriptionTier]);

  const closeAd = () => {
    setIsVisible(false);
    localStorage.setItem('lastAdSeen', new Date().getTime().toString());
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 right-6 z-[50] max-w-sm rounded-lg border border-gold/30 bg-obsidian p-5 shadow-2xl"
        >
          <button onClick={closeAd} className="absolute top-2 left-2 text-gold-muted hover:text-gold">
            <X className="h-4 w-4" />
          </button>
          <p className="mt-2 text-sm font-serif leading-relaxed text-gold-light">
            {adMessage}
          </p>
          <button className="mt-4 w-full rounded border border-gold bg-gold/10 px-4 py-2 text-xs font-bold text-gold transition hover:bg-gold hover:text-obsidian">
            استكشف العضويات المتقدمة
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
