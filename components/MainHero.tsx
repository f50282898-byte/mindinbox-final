"use client";
import { motion } from "framer-motion";
import { useAppStore } from "@/lib/store";

export function MainHero() {
  const incrementFreeInteractions = useAppStore(state => state.incrementFreeInteractions);
  const interactions = useAppStore(state => state.freeInteractions);

  return (
    <section className="relative mx-auto flex min-h-screen max-w-7xl items-center px-6 py-20 lg:px-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="grid w-full gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center"
      >
        <div>
          <p className="mb-6 inline-flex items-center rounded-full border border-gold/40 bg-[#121212]/80 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-gold-light">
            عقل في صندوق
          </p>
          <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-[#F5E7BA] md:text-6xl lg:text-7xl">
            ملاذك الفلسفي الآمن.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-gold-muted/80 font-serif">
            مساحة راقية للتأمل، البصيرة، وبناء العادات. مصممة لمن يرغبون في تحويل أفكارهم إلى هيكل صلب ومستدام.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button 
              onClick={() => incrementFreeInteractions()}
              className="gold-glow inline-flex items-center justify-center rounded-full bg-gold px-8 py-4 text-sm font-bold text-obsidian transition hover:scale-[1.02]"
            >
              استكشف الملاذ (التفاعلات: {interactions}/5)
            </button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}