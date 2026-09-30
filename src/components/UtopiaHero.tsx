"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

function GoldDust() {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; s: number; d: number; }>>([]);
  
  useEffect(() => {
    // Generate static particle starting positions
    const newParticles = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      s: Math.random() * 2 + 1,
      d: Math.random() * 5 + 5
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-gold/50 shadow-[0_0_10px_2px_rgba(212,175,55,0.4)]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.s}px`,
            height: `${p.s}px`,
          }}
          animate={{
            y: [0, -100, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: p.d,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

export function UtopiaHero() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_#0a0a0a_0%,_#000_100%)] overflow-hidden">
      <GoldDust />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="z-10 flex flex-col items-center text-center px-4"
      >
        <div className="gold-glow mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-gold/30 bg-black text-gold-light shadow-2xl">
          <span className="font-serif text-4xl font-bold">ع</span>
        </div>
        
        <h1 className="gold-text-glow font-serif text-6xl md:text-8xl text-gold-light tracking-wide mb-6">
          عقل في صندوق
        </h1>
        
        <p className="text-xl md:text-2xl text-gold-muted/80 max-w-2xl font-serif leading-relaxed mb-12">
          لا تسأل لتجد الإجابة، بل تساءل لترتقي بوعيك. 
          ملاذك الفلسفي للذكاء الاصطناعي في بيئة معزولة عن ضجيج العالم.
        </p>

        <Link href="/utopia">
          <button className="gold-glow relative group overflow-hidden rounded-full border border-gold/50 bg-black/50 px-12 py-5 text-xl text-gold font-serif transition-all hover:border-gold hover:text-black">
            <div className="absolute inset-0 bg-gold translate-y-full transition-transform duration-500 ease-out group-hover:translate-y-0" />
            <span className="relative z-10 font-bold tracking-widest">ابدأ الآن</span>
          </button>
        </Link>
      </motion.div>
    </div>
  );
}
