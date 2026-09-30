"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RIDDLES = [
  "أنا لست حياً، لكني أنمو؛ وليس لدي رئتان، لكني بحاجة إلى الهواء. ما أنا؟ (النار)",
  "كلما أخذت مني أكثر، كلما كبرت أكثر. ما أنا؟ (الحفرة / الفراغ)",
  "أتحدث بلا فم وأسمع بلا أذنين. ليس لدي جسد، ولكني أحيا بالرياح. ما أنا؟ (الصدى)"
];

export function GoldenSymbols() {
  const [activeRiddle, setActiveRiddle] = useState<string | null>(null);

  const triggerRiddle = (index: number) => {
    setActiveRiddle(RIDDLES[index]);
  };

  return (
    <>
      {/* Symbol 1 - Bottom Left */}
      <button 
        onClick={() => triggerRiddle(0)}
        className="fixed bottom-10 left-10 z-30 text-gold/30 hover:text-gold-light hover:scale-125 transition-all duration-500 cursor-pointer"
        aria-label="Discover Symbol 1"
      >
        ✨
      </button>

      {/* Symbol 2 - Top Center (slightly off) */}
      <button 
        onClick={() => triggerRiddle(1)}
        className="fixed top-20 right-1/4 z-30 text-gold/30 hover:text-gold-light hover:scale-125 transition-all duration-500 cursor-pointer"
        aria-label="Discover Symbol 2"
      >
        🗝
      </button>

      {/* Symbol 3 - Mid Right */}
      <button 
        onClick={() => triggerRiddle(2)}
        className="fixed top-1/2 right-12 z-30 text-gold/30 hover:text-gold-light hover:scale-125 transition-all duration-500 cursor-pointer"
        aria-label="Discover Symbol 3"
      >
        👁
      </button>

      <AnimatePresence>
        {activeRiddle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/95 backdrop-blur-3xl px-4"
            onClick={() => setActiveRiddle(null)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="gold-glow max-w-2xl text-center rounded-3xl border border-gold/40 bg-[#0a0a0a] p-16"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="gold-text-glow font-serif text-3xl text-gold-light mb-8">لغز الفلاسفة</h2>
              <p className="text-2xl leading-relaxed text-gold-muted font-serif">
                {activeRiddle}
              </p>
              <button 
                onClick={() => setActiveRiddle(null)}
                className="mt-12 text-sm text-gold hover:text-gold-light tracking-widest border-b border-gold/30 pb-1"
              >
                أغلق عينيك لتفهم
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
