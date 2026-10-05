"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getBlob, ref as storageRef } from "firebase/storage";
import { motion } from "framer-motion";
import { Download, Lock } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { auth, db, paths, storage } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";
import { TIER_DEFINITIONS, tierSatisfies, type Tier } from "@/lib/tiers";
import { PremiumShield } from "@/components/PremiumShield";
import { GreekColumns } from "@/components/GreekColumns";
import { ArtLayer } from "@/components/art/ArtLayer";
import { Logo } from "@/components/Logo";

interface LibraryItem {
  title: string;
  summary?: string;
  videoUrl?: string;
  filePath?: string;
}

interface CommunityPost {
  id: string;
  authorName: string;
  text: string;
  createdAt?: { toDate?: () => Date };
}

/**
 * Validates a YouTube URL and normalises it to a privacy-preserving embed.
 * Blocks arbitrary hosts so `videoUrl` cannot become an injection vector.
 */
function safeYouTubeEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const id = (() => {
      if (host === "youtube.com" || host === "m.youtube.com") {
        if (url.pathname.startsWith("/embed/")) return url.pathname.slice(7).split("/")[0];
        if (url.pathname === "/watch") return url.searchParams.get("v");
      }
      if (host === "youtu.be") return url.pathname.slice(1).split("/")[0];
      return null;
    })();
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

/**
 * Member library for The Oracle and The Sanctum.
 *
 * Access control is enforced by `firestore.rules` (`siteConfig/library`
 * requires an oracle/sanctum `subscriptionTier`). The check below only
 * decides what to render; it never decides what is readable.
 */
export function MemberLibrary({ requiredTier }: { requiredTier: Extract<Tier, "oracle" | "sanctum"> }) {
  const { uid, tier, setMembership } = useAppStore();
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const definition = TIER_DEFINITIONS[requiredTier];
  const permitted = tierSatisfies(tier, requiredTier);

  /* â”€â”€ Resolve the authoritative tier from the server â”€â”€ */
  useEffect(() => {
    let active = true;
    const authInstance = auth;
    const dbInstance = db;
    if (!authInstance || !dbInstance) {
      setChecked(true);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = authInstance.currentUser;
          if (!user) {
            setChecked(true);
            return;
          }
          const profile = await getDoc(doc(dbInstance, paths.user(user.uid)));
          if (!active) return;
          const serverTier = profile.data()?.subscriptionTier as Tier | undefined;
          if (serverTier) setMembership(serverTier, null);
          if (serverTier && tierSatisfies(serverTier, requiredTier)) {
            const library = await getDoc(doc(dbInstance, paths.libraryDoc));
            if (!active) return;
            const rows = library.data()?.items;
            if (Array.isArray(rows)) setItems(rows as LibraryItem[]);
          }
        } catch {
          if (active) setMessage("تعذّر تحديث بيانات العضوية. تحقّق من الاتصال ثم أعد المحاولة.");
        } finally {
          if (active) setChecked(true);
        }
      })();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [requiredTier, setMembership]);

  /* â”€â”€ Sanctum community stream â”€â”€ */
  useEffect(() => {
    if (requiredTier !== "sanctum" || !permitted || !uid || !db) return;
    const q = query(collection(db, paths.communityPosts), orderBy("createdAt", "desc"), limit(30));
    return onSnapshot(
      q,
      (snapshot) =>
        setPosts(snapshot.docs.map((p) => ({ id: p.id, ...(p.data() as Omit<CommunityPost, "id">) }))),
      () => setMessage("تعذّر تحميل دائرة المحراب. تحقّق من العضوية والاتصال.")
    );
  }, [requiredTier, permitted, uid]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    const user = auth?.currentUser;
    if (!text || !user || !db || !permitted || posting) return;
    setPosting(true);
    try {
      await addDoc(collection(db, paths.communityPosts), {
        uid: user.uid,
        authorName: user.displayName ?? "عضو المحراب",
        text,
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setMessage("نُشرَت تأملتك في الدائرة.");
    } catch {
      setMessage("تعذّر النشر. حاول مرة أخرى.");
    } finally {
      setPosting(false);
    }
  };

  /* â”€â”€ PDF download via Storage SDK â”€â”€ */
  const download = async (item: LibraryItem) => {
    if (!item.filePath || !storage) return;
    setBusyPath(item.filePath);
    try {
      const blob = await getBlob(storageRef(storage, item.filePath));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${item.title.replace(/[^\p{L}\p{N}_-]/gu, "-")}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMessage("الملف غير متاح أو عضويتك لا تشمله.");
    } finally {
      setBusyPath(null);
    }
  };

  const videos = useMemo(() => items.filter((i) => safeYouTubeEmbed(i.videoUrl ?? "")), [items]);
  const documents = useMemo(() => items.filter((i) => i.filePath), [items]);

  /* â”€â”€ Render states â”€â”€ */
  if (!checked) {
    return (
      <Shell requiredTier={requiredTier}>
        <p className="display-arabic py-20 text-center text-sm text-gold-muted/60">
          …جارٍ فتح مكتبتك
        </p>
      </Shell>
    );
  }

  if (!uid) {
    return (
      <Shell requiredTier={requiredTier}>
        <LockedState
          title={definition.name}
          message="هذه المكتبة لأعضائها. سجّل الدخول بالحساب المرتبط باشتراكك."
        />
      </Shell>
    );
  }

  if (!permitted) {
    return (
      <Shell requiredTier={requiredTier}>
        <LockedState
          title={definition.name}
          message={`مستواك الحالي لا يشمل هذا المستوى. ${definition.scarcity}`}
        />
      </Shell>
    );
  }

  return (
    <Shell requiredTier={requiredTier}>
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:py-16">
        <header className="text-center">
          <p className="text-[10px] tracking-[0.35em] text-ink-3">
            {requiredTier === "sanctum" ? "THE INNER CIRCLE" : "THE DAILY PRACTICE"}
          </p>
          <h1 className="gold-text-glow display-arabic mt-3 text-3xl font-bold text-gold-light sm:text-5xl">
            {definition.name}
          </h1>
          <p className="display-arabic mt-4 text-sm text-gold-muted/70">{definition.tagline}</p>
        </header>

        <PremiumShield>
          {/* â”€â”€ Masterclasses (Sanctum) â€” antique gold frames â”€â”€ */}
          {requiredTier === "sanctum" && (
            <section className="mt-12">
              <h2 className="display-arabic mb-5 text-xl text-gold-light">المحاضرات</h2>
              {videos.length ? (
                <div className="space-y-8">
                  {videos.map((item, index) => (
                    <figure key={`${item.title}-${index}`} className="gold-frame rounded-2xl p-3">
                      <div className="aspect-video overflow-hidden rounded-xl bg-black">
                        <iframe
                          className="size-full"
                          src={safeYouTubeEmbed(item.videoUrl!)!}
                          title={item.title}
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      </div>
                      <figcaption className="px-2 pb-1 pt-4">
                        <h3 className="display-arabic text-lg text-gold-light">{item.title}</h3>
                        {item.summary && (
                          <p className="mt-1.5 text-sm leading-relaxed text-gold-muted/70">
                            {item.summary}
                          </p>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <Empty>لم تُنشر محاضرات بعد.</Empty>
              )}
            </section>
          )}

          {/* â”€â”€ Sanctum community â”€â”€ */}
          {requiredTier === "sanctum" && (
            <section className="panel mt-12 p-6 sm:p-8">
              <h2 className="display-arabic text-xl text-gold-light">دائرة المحراب</h2>
              <p className="mt-2 text-sm text-gold-muted/65">
                غرفة مقصورة لأسئلة جادة وتأملات مشتركة.
              </p>

              <form onSubmit={publish} className="mt-6 space-y-4">
                <label htmlFor="circle-post" className="sr-only">
                  شارك تأملتك مع الدائرة
                </label>
                <textarea
                  id="circle-post"
                  rows={3}
                  maxLength={1200}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="شارك تأملتك مع الدائرة…"
                  className="field resize-none"
                  data-allow-select
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!draft.trim() || posting}
                    className="btn-ghost py-2.5 text-sm"
                  >
                    {posting ? "جارٍ النشر…" : "انشر"}
                  </button>
                </div>
              </form>

              <div className="mt-8 space-y-3">
                {posts.length ? (
                  posts.map((post) => (
                    <article key={post.id} className="panel-inset p-4" data-allow-select>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gold-muted/90">
                        {post.text}
                      </p>
                      <p className="mt-2 text-[10px] text-ink-3">
                        {post.authorName}
                        {post.createdAt?.toDate
                          ? ` Â· ${post.createdAt.toDate().toLocaleDateString("ar-EG")}`
                          : ""}
                      </p>
                    </article>
                  ))
                ) : (
                  <Empty>الدائرة هادئة. ابدأ الحديث.</Empty>
                )}
              </div>
            </section>
          )}

          {/* â”€â”€ Study documents (PDF) â”€â”€ */}
          {definition.pdfLibrary && (
            <section className="panel mt-12 p-6 sm:p-8">
              <h2 className="display-arabic text-xl text-gold-light">المخطوطات</h2>
              {documents.length ? (
                <ul className="mt-5 divide-y divide-gold/10">
                  {documents.map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gold-light">{item.title}</p>
                        {item.summary && (
                          <p className="mt-0.5 truncate text-xs text-gold-muted/60">
                            {item.summary}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void download(item)}
                        disabled={busyPath === item.filePath}
                        className="btn-ghost shrink-0 gap-2 py-2 text-xs"
                      >
                        <Download className="size-3.5" />
                        {busyPath === item.filePath ? "â€¦" : "تحميل"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>لا توجد مخطوطات منشورة بعد.</Empty>
              )}
            </section>
          )}

          {/* â”€â”€ Daily philosopher analysis â”€â”€ */}
          {definition.dailyAnalysis && <DailyAnalysis />}
        </PremiumShield>

        {message && (
          <p role="status" className="mt-8 text-center text-xs text-gold/70">
            {message}
          </p>
        )}
      </div>
    </Shell>
  );
}

/** Aggregates the member's own week and asks the wise for a reading. */
function DailyAnalysis() {
  const entries = useAppStore((s) => s.entries);
  const philosopherId = useAppStore((s) => s.philosopherId);
  const [reading, setReading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyse = async () => {
    if (!entries.length || loading) return;
    setLoading(true);
    setError(null);
    const recent = entries.slice(0, 25);
    const transcript = recent
      .map((e) => `[${e.kind}] ${e.text}`)
      .join("\n")
      .slice(0, 3000);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          philosopherId,
          messages: [
            {
              role: "user",
              content: `هذه سجلّاتي الأخيرة. اقرأها ثم أعطني قراءة يومية موجزة (من ٣ إلى ٥ فقرات): ما النمط؟ أين القوة؟ أين التهرّب؟ ولا تنصحني طبياً.\n\nالسجل:\n${transcript}`,
            },
          ],
        }),
      });
      const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (data.ok && data.text) setReading(data.text);
      else setError(data.error ?? "تعذّر توليد القراءة.");
    } catch {
      setError("انقطع الاتصال.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel mt-12 p-6 sm:p-8">
      <h2 className="display-arabic text-xl text-gold-light">قراءة الفيلسوف اليومية</h2>
      <p className="mt-2 text-sm text-gold-muted/65">
        يقرأ الفيلسوف سجلّك الأسبوعي ويعيد إليك قراءته.
      </p>

      <button
        type="button"
        onClick={analyse}
        disabled={loading || entries.length === 0}
        className="btn-gold mt-6 py-3"
      >
        <span>{loading ? "…يتأمّل في سجلّك" : "ولّد القراءة"}</span>
      </button>

      {!entries.length && (
        <p className="mt-4 text-xs text-ink-3">سجّل مدخلات في المتتبع أولاً.</p>
      )}
      {error && <p className="mt-4 text-xs text-red-300/85">{error}</p>}

      {reading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <div className="hairline mb-5" />
          <p className="display-arabic whitespace-pre-wrap text-sm leading-loose text-gold-muted/90">
            {reading}
          </p>
        </motion.div>
      )}
    </section>
  );
}

function Shell({
  requiredTier,
  children,
}: {
  requiredTier: Extract<Tier, "oracle" | "sanctum">;
  children: React.ReactNode;
}) {
  const definition = TIER_DEFINITIONS[requiredTier];
  return (
    <div className="relative min-h-screen">
      {/* The gate engraving, with the procedural colonnade as its placeholder. */}
      <ArtLayer id="gate" fallback={<GreekColumns density="sparse" />} />
      <div className="relative">{children}</div>
      <footer className="display-arabic flex flex-col items-center gap-3 pb-10 text-center text-[11px] text-ink-3">
        <Logo size={38} />
        <span>{definition.name} · {definition.latin}</span>
      </footer>
    </div>
  );
}

function LockedState({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto w-full max-w-lg px-5 py-24 text-center">
      <Lock className="mx-auto size-8 text-ink-3" aria-hidden="true" />
      <h1 className="gold-text-glow display-arabic mt-6 text-3xl font-bold text-gold-light">
        {title}
      </h1>
      <p className="display-arabic mt-5 text-sm leading-relaxed text-gold-muted/65">{message}</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/membership" className="btn-gold py-3">
          <span>راجع العضويات</span>
        </Link>
        <Link href="/wisdom" className="btn-ghost py-3">
          عُد إلى الحكيم
        </Link>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="display-arabic py-6 text-center text-sm text-ink-3">{children}</p>
  );
}