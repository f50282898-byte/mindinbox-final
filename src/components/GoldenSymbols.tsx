"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, paths } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";

interface Riddle {
  title: string;
  body: string;
  /** Revealed after the visitor commits to an answer. */
  answer: string;
}

const RIDDLES: Record<number, Riddle> = {
  0: {
    title: "لغز الرمز الأول",
    body: "لا أنا حية، ولا تتنفس، ومع ذلك أزداد نمواً كلما اقتربت من الهواء. ما أنا؟",
    answer: "النار. حين ينقص الهواء يخبو جمالها، وحين يزيد اشتدت.",
  },
  1: {
    title: "لغز الرمز الثاني",
    body: "كلما أخذت مني أكثر، كبرت أكثر. لا مِلء لي، ومع ذلك أصير أوسع كلما غارت.",
    answer: "الفراغ. المسحُ يوسّعه، والاكتفاء يصغّره.",
  },
  2: {
    title: "لغز الرمز الثالث",
    body: "أتحدث بلا فم، وأسمع بلا أذنين، وأحيا بالرياح وحدها. ما أنا؟",
    answer: "الصدى. لا صوت لي، لكن الريح تولّد مني صدى غيري.",
  },
};

interface SymbolSpec {
  id: number;
  /** Percent offsets within the viewport. */
  x: number;
  y: number;
  label: string;
}

/**
 * Three hidden gold symbols.
 *
 * Rendered as inline SVG rather than emoji: the emoji used previously
 * (`✨ 🗝 👁`) ignored the palette and broke the visual language.
 * Placement is viewport-relative and suppressed on `/admin` so the console
 * stays clean.
 */
const SYMBOLS: SymbolSpec[] = [
  { id: 0, x: 12, y: 78, label: "رمز الشرارة" },
  { id: 1, x: 86, y: 22, label: "رمز المفتاح" },
  { id: 2, x: 8, y: 44, label: "رمز العين" },
];

function Glyph({ id }: { id: number }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (id === 0) {
    // Spark / flame
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 2.5c2.6 3.4 1.2 5.2.4 6.6 1.9-.7 2.8-2.3 2.9-4.1 2 2 3.2 4.6 3.2 7.2A6.5 6.5 0 0 1 12 21.5 6.5 6.5 0 0 1 5.5 12c0-2.4.8-4.3 2.2-6 .3 1.5 1.1 2.4 2.1 2.9C10.4 6.4 10.6 4.4 12 2.5Z" />
      </svg>
    );
  }
  if (id === 1) {
    // Key
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="7.5" cy="12" r="3.6" />
        <path d="M11.1 12H21M18 12v3.2M15 12v2.4" />
      </svg>
    );
  }
  // Eye
  return (
    <svg {...common} aria-hidden="true">
      <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function GoldenSymbols({
  solvedCount = 0,
  onSolve,
}: {
  solvedCount?: number;
  onSolve?: () => void;
}) {
  const pathname = usePathname();
  const recordPuzzle = useAppStore((s) => s.recordPuzzle);
  const puzzles = useAppStore((s) => s.puzzles);
  const uid = useAppStore((s) => s.uid);

  const [open, setOpen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Hidden on narrow screens (they collide with content) and in the console.
  useEffect(() => {
    const check = () => setHidden(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isSolved = useMemo(() => {
    const set = new Set(puzzles.map((p) => p.symbolId));
    return (id: number) => set.has(id);
  }, [puzzles]);

  const activeRiddle = open !== null ? RIDDLES[open] : null;

  const handleReveal = useCallback(async () => {
    if (open === null) return;
    setRevealed(true);
    recordPuzzle(open);
    onSolve?.();
    if (!uid || !db) return;
    try {
      await setDoc(
        doc(db, `${paths.userPuzzles(uid)}/${open}`),
        { symbolId: open, createdAt: serverTimestamp() },
        { merge: true }
      );
    } catch {
      // Progress is mirrored locally; failure here is not fatal.
    }
  }, [open, onSolve, recordPuzzle, uid]);

  // Never render on the console, nor over the cinematic landing hero.
  const suppressed =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/god-mode-admin") ||
    pathname === "/";
  if (suppressed) return null;

  return (
    <>
      {!hidden &&
        SYMBOLS.map((symbol) => (
          <button
            key={symbol.id}
            type="button"
            onClick={() => {
              setOpen(symbol.id);
              setRevealed(false);
            }}
            aria-label={`اكتشف ${symbol.label}`}
            className={`fixed z-[65] hidden transition-all duration-700 ease-silk sm:block ${
              isSolved(symbol.id)
                ? "text-gold opacity-30"
                : "text-ink-3 hover:scale-125 hover:text-gold-light"
            }`}
            style={{ left: `${symbol.x}%`, top: `${symbol.y}%`, translate: "-50% -50%" }}
          >
            <span className="relative block">
              <Glyph id={symbol.id} />
            </span>
          </button>
        ))}

      <AnimatePresence>
        {activeRiddle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            role="dialog"
            aria-modal="true"
            aria-label={activeRiddle.title}
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-volcanic/93 px-5 backdrop-blur-2xl"
            onClick={() => setOpen(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="glass-strong gold-frame w-full max-w-xl rounded-3xl p-9 text-center sm:p-14"
            >
              <p className="text-[10px] tracking-[0.35em] text-ink-3">
                {solvedCount > 0 ? `عثرت على ${solvedCount} من ٣` : "عثرت على ٠ من ٣"}
              </p>

              <h2 className="gold-text-glow display-arabic mt-4 text-2xl font-bold text-gold-light sm:text-3xl">
                {activeRiddle.title}
              </h2>

              <p className="display-arabic mt-7 text-lg leading-loose text-gold-muted sm:text-xl">
                {activeRiddle.body}
              </p>

              {revealed ? (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 border-t border-gold/15 pt-6 text-sm leading-relaxed text-gold/85"
                >
                  {activeRiddle.answer}
                </motion.p>
              ) : (
                <button
                  type="button"
                  onClick={handleReveal}
                  className="mt-9 border-b border-gold/30 pb-1 text-xs tracking-widest text-gold transition-colors hover:border-gold hover:text-gold-light"
                >
                  أغمض عينيك لتفهم
                </button>
              )}

              <button
                type="button"
                onClick={() => setOpen(null)}
                className="mt-9 block w-full text-xs text-ink-3 transition-colors hover:text-gold-muted"
              >
                  إغلاق
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}