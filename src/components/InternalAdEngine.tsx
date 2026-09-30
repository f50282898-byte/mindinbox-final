"use client";

import { AnimatePresence, motion } from "framer-motion";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";

type AdContent = { headline: string; detail: string; href: string };
const fallbackAds: AdContent[] = [
  { headline: "A deeper practice begins with a question.", detail: "Explore a more considered space for your daily reflections.", href: "/oracle" },
  { headline: "Make time for the ideas that stay.", detail: "The Sanctum brings masterclasses and guided study together.", href: "/sanctum" },
  { headline: "Give your attention somewhere meaningful to go.", detail: "Discover the expanded membership when you are ready.", href: "/#access" },
];
const rotationMs = 3 * 24 * 60 * 60 * 1000;

export function InternalAdEngine() {
  const tier = useAppStore((state) => state.tier);
  const [adIndex, setAdIndex] = useState<number | null>(null);
  const [adContent, setAdContent] = useState<AdContent[]>(fallbackAds);
  const [dismissed, setDismissed] = useState(false);
  const [adCycleKey, setAdCycleKey] = useState("");

  useEffect(() => {
    const now = Date.now();
    const saved = document.cookie.split("; ").find((part) => part.startsWith("miab-ad="))?.slice(8);
    const [savedAtText, savedIndexText] = saved?.split(":") ?? [];
    const savedAt = Number(savedAtText);
    const savedIndex = Number(savedIndexText);
    const index = Number.isFinite(savedAt) && now - savedAt < rotationMs && Number.isFinite(savedIndex)
      ? savedIndex % fallbackAds.length
      : (Number.isFinite(savedIndex) ? savedIndex + 1 : 0) % fallbackAds.length;
    const rotationStartedAt = Number.isFinite(savedAt) && now - savedAt < rotationMs ? savedAt : now;
    document.cookie = `miab-ad=${rotationStartedAt}:${index}; Max-Age=${Math.floor(rotationMs / 1000)}; Path=/; SameSite=Lax`;
    setAdIndex(index);
    setAdCycleKey(String(rotationStartedAt));
    setDismissed(sessionStorage.getItem("miab-ad-dismissed") === String(rotationStartedAt));

    if (!db) return;
    return onSnapshot(doc(db, "siteConfig", "ads"), (snapshot) => {
      const configured = snapshot.data()?.items;
      if (Array.isArray(configured)) {
        const valid = configured.filter((item): item is AdContent =>
          typeof item?.headline === "string" && typeof item?.detail === "string" && typeof item?.href === "string",
        );
        if (valid.length) setAdContent(valid);
      }
    }, () => undefined);
  }, []);

  if (tier !== "free" || adIndex === null || dismissed) return null;
  const ad = adContent[adIndex % adContent.length];

  return (
    <AnimatePresence>
      <motion.aside
        animate={{ opacity: 1, y: 0 }}
        className="membership-note"
        exit={{ opacity: 0, y: 18 }}
        initial={{ opacity: 0, y: 18 }}
        key={ad.headline}
      >
        <div><span className="membership-note-label">A NOTE ON MEMBERSHIP</span><strong>{ad.headline}</strong><span>{ad.detail}</span></div>
        <Link href={ad.href}>Explore <span aria-hidden="true">↗</span></Link>
        <button
          aria-label="Dismiss membership note"
          onClick={() => {
            setDismissed(true);
            sessionStorage.setItem("miab-ad-dismissed", adCycleKey);
          }}
          type="button"
        >
          ×
        </button>
      </motion.aside>
    </AnimatePresence>
  );
}
