const fs = require('fs');
const path = require('path');

function w(rel, content) {
  const abs = path.join(__dirname, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  console.log("OK", rel, content.length, "bytes");
}

w("src/app/globals.css", `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-black text-[#D9D0BA] antialiased overflow-x-hidden;
    background: radial-gradient(circle at center, #080808 0%, #000000 100%);
  }
}

@layer utilities {
  .gold-glow {
    box-shadow: 0 0 30px rgba(212, 175, 55, 0.2);
  }
  .gold-text-glow {
    text-shadow: 0 0 15px rgba(212, 175, 55, 0.4), 0 0 30px rgba(212, 175, 55, 0.2);
  }
}

::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: #000000; }
::-webkit-scrollbar-thumb { background: rgba(212, 175, 55, 0.3); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: rgba(212, 175, 55, 0.6); }
`);

w("src/app/layout.tsx", `import type { Metadata } from "next";
import { Cairo, Playfair_Display } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "\\u0639\\u0642\\u0644 \\u0641\\u064A \\u0635\\u0646\\u062F\\u0648\\u0642 | Mind in a Box",
  description: "A philosophical AI sanctuary.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={\`\${cairo.variable} \${playfair.variable}\`}>
      <body className="font-sans min-h-screen selection:bg-gold/30 selection:text-gold-light">
        {children}
      </body>
    </html>
  );
}
`);

w("src/components/UtopiaHero.tsx", `"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

export function UtopiaHero() {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const yBackground = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const yColumns = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const opacityText = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate random particles for gold dust
  const particles = Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: 15 + Math.random() * 20,
    delay: Math.random() * -20,
    size: Math.random() * 3 + 1,
  }));

  if (!mounted) return null;

  return (
    <div ref={containerRef} className="relative h-[150vh] w-full bg-black overflow-hidden">
      {/* Background Deep Void */}
      <motion.div 
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_#111_0%,_#000_100%)]"
        style={{ y: yBackground }}
      />

      {/* Greek Columns Parallax Layer */}
      <motion.div 
        className="absolute inset-0 z-10 opacity-30 mix-blend-screen bg-[url('/temple.jpg')] bg-cover bg-center bg-no-repeat"
        style={{ 
          y: yColumns,
          filter: 'invert(1) sepia(1) saturate(2) hue-rotate(330deg) brightness(0.7)'
        }}
      />

      {/* Gold Dust Particles */}
      <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-gold shadow-[0_0_8px_2px_rgba(212,175,55,0.6)]"
            style={{
              left: \`\${p.x}%\`,
              top: \`\${p.y}%\`,
              width: p.size,
              height: p.size,
            }}
            animate={{
              y: [0, -200],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Hero Typography & Navigation */}
      <motion.div 
        className="sticky top-0 z-30 flex h-screen w-full flex-col items-center justify-center text-center px-4"
        style={{ opacity: opacityText }}
      >
        <motion.p 
          initial={{ opacity: 0, letterSpacing: "0.1em" }}
          animate={{ opacity: 1, letterSpacing: "0.5em" }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="mb-6 font-serif text-[10px] uppercase text-gold-light/60 tracking-[0.5em]"
        >
          أعظم العقول تنتظرك
        </motion.p>
        
        <motion.h1 
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 2.5, ease: "easeOut", delay: 0.5 }}
          className="gold-text-glow font-serif text-5xl md:text-7xl lg:text-8xl text-gold-light tracking-tight"
        >
          عقل في صندوق
        </motion.h1>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 2 }}
          className="mt-16"
        >
          <Link 
            href="/utopia" 
            className="group relative inline-flex items-center justify-center overflow-hidden font-serif text-lg text-gold-muted transition-all duration-500 hover:text-gold"
          >
            <span className="relative z-10 tracking-[0.2em]">الولوج إلى المحراب</span>
            <span className="absolute bottom-0 left-0 h-[1px] w-0 bg-gold transition-all duration-700 ease-out group-hover:w-full" />
          </Link>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center opacity-50">
        <motion.div 
          animate={{ y: [0, 10, 0] }} 
          transition={{ duration: 2, repeat: Infinity }}
          className="h-16 w-[1px] bg-gradient-to-b from-transparent via-gold to-transparent"
        />
      </div>
    </div>
  );
}
`);

w("src/app/page.tsx", `import { UtopiaHero } from "@/components/UtopiaHero";

export const runtime = "edge";

export default function Home() {
  return (
    <main className="bg-black">
      <UtopiaHero />
    </main>
  );
}
`);
