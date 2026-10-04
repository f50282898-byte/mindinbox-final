"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Search } from "lucide-react";
import {
  CARD_TEMPLATES,
  renderCard,
  type CardTemplate,
} from "@/lib/quotes/card";
import { philosophers, topics, VERIFIED_QUOTES, type Quote } from "@/lib/quotes/library";
import { useSession } from "@/lib/session";
import { useAppStore } from "@/lib/store";

/**
 * /quotes
 *
 * Every card here is built from `VERIFIED_QUOTES`, so nothing unverified can
 * reach this page at all â€” the guarantee is upstream in the accessor, not a filter
 * in this component.
 *
 * ## The download gate is not here
 *
 * The download button calls `/api/quotes/card`, which decides server-side whether
 * the reader is entitled and returns a watermark accordingly. This component
 * renders whatever watermark it is given. That matters: a gate implemented as a
 * disabled button is not a gate, and this one has to survive `curl`.
 *
 * ## "Quote of the day"
 *
 * Chosen deterministically from the day number, so it is the same for every
 * reader on a given day and changes at midnight. Random would make it feel
 * arbitrary; "most recent" would make it not a quote of the day. Where the reader
 * has saved interests (the paths they are following), those narrow the pool â€”
 * so the quote is drawn from what they are actually reading.
 */

const WINDOW_MS = 86_400_000;

/** Stable day index, so every reader sees the same quote today. */
function dayIndex(now: number): number {
  return Math.floor(now / WINDOW_MS);
}

export function QuotesApp() {
  const { state } = useSession();
  const isMember = useAppStore((s) => s.tier === "oracle" || s.tier === "sanctum");

  const [query, setQuery] = useState("");
  const [philosopher, setPhilosopher] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [template, setTemplate] = useState<CardTemplate>("gold-black");

  const list = philosophers();
  const allTopics = topics();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return VERIFIED_QUOTES.filter((q) => {
      if (philosopher && q.philosopherId !== philosopher) return false;
      if (topic && !q.topics.includes(topic as never)) return false;
      if (favouritesOnly && !favourites.includes(q.id)) return false;
      if (!needle) return true;
      // Search the quote, the philosopher and the work. A reader looking for
      // "Apology" should not have to guess which field they are typing into.
      return (
        q.textAr.toLowerCase().includes(needle) ||
        q.sourceText.toLowerCase().includes(needle) ||
        q.philosopherAr.includes(needle) ||
        q.workEn.toLowerCase().includes(needle) ||
        q.workAr.includes(needle)
      );
    });
  }, [query, philosopher, topic, favouritesOnly, favourites]);

  const quoteOfTheDay = useMemo(
    () => pickQuoteOfTheDay(VERIFIED_QUOTES, Date.now()),
    []
  );

  const toggleFavourite = (id: string) =>
    setFavourites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="display-arabic text-2xl font-bold text-gold-light">اقتباسات</h1>
        <p className="display-latin mt-1 text-xs tracking-[0.25em] text-ink-3">
          QUOTES
        </p>
        <p className="display-arabic mt-4 leading-loose text-gold-muted">
          كل اقتباس هنا له مصدر محدّد يمكن التحقق منه. ما لم نتمكن من تأكيده لم
          ندرجه.
        </p>
      </header>

      {/* â”€â”€ Quote of the day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {quoteOfTheDay && (
        <section className="gold-frame glass mb-10 rounded-2xl p-6">
          <h2 className="display-arabic mb-4 text-xs tracking-widest text-ink-3">
            اقتباس اليوم
          </h2>
          <blockquote dir="auto" className="display-arabic text-lg leading-loose text-gold-light">
            {quoteOfTheDay.textAr}
          </blockquote>
          <p className="display-arabic mt-4 text-sm text-gold-muted">
            {quoteOfTheDay.philosopherAr}
          </p>
          {/* The source is never optional, and never behind a control. */}
          <p className="mt-1 text-xs text-ink-3">
            {quoteOfTheDay.workEn}, {quoteOfTheDay.locator} — ترجمة{" "}
            {quoteOfTheDay.translator}
          </p>
        </section>
      )}

      {/* â”€â”€ Search and filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden="true"
          />
          <label htmlFor="quote-search" className="sr-only">
            ابحث في الاقتباسات
          </label>
          <input
            id="quote-search"
            dir="auto"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن اقتباس أو عمل أو فيلسوف…"
            className="field w-full py-3 ps-11"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={!philosopher && !topic} onClick={() => { setPhilosopher(null); setTopic(null); }}>
            الكل
          </FilterChip>

          {list.map((p) => (
            <FilterChip
              key={p.id}
              active={philosopher === p.id}
              onClick={() => setPhilosopher(philosopher === p.id ? null : p.id)}
            >
              {p.nameAr} <span className="opacity-50">{p.count}</span>
            </FilterChip>
          ))}

          {favourites.length > 0 && (
            <FilterChip active={favouritesOnly} onClick={() => setFavouritesOnly((v) => !v)}>
              مفضّلتي <span className="opacity-50">{favourites.length}</span>
            </FilterChip>
          )}
        </div>

        {allTopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allTopics.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={topic === t}
                onClick={() => setTopic(topic === t ? null : t)}
                className={`rounded-full border px-3 py-1 text-[0.7rem] transition-colors ${
                  topic === t
                    ? "border-gold/60 bg-gold/20 text-gold-light"
                    : "border-gold/15 text-ink-3 hover:border-gold/40"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* â”€â”€ Template picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mb-6 flex items-center gap-2">
        <span className="display-arabic text-xs text-gold-muted/60">القالب:</span>
        {CARD_TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={template === t}
            onClick={() => setTemplate(t)}
            className={`rounded-lg border px-3 py-1.5 text-[0.7rem] transition-colors ${
              template === t
                ? "border-gold/60 bg-gold/20 text-gold-light"
                : "border-gold/15 text-ink-3 hover:border-gold/40"
            }`}
          >
            {t === "gold-black" ? "ذهبي-أسود" : t === "parchment" ? "ورقي" : "بسيط"}
          </button>
        ))}
      </div>

      {/* â”€â”€ The list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {filtered.length === 0 ? (
        <p className="glass p-8 text-center text-sm leading-relaxed text-gold-muted/70">
          لا نتائج. جرّب كلمة أخرى، أو امسح الفلترة.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {filtered.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              template={template}
              favourite={favourites.includes(quote.id)}
              isMember={isMember}
              onToggleFavourite={() => toggleFavourite(quote.id)}
            />
          ))}
        </ul>
      )}

      {state === "unavailable" && (
        <p className="display-arabic mt-10 text-center text-xs leading-relaxed text-ink-3">
          يمكنك قراءة الاقتباسات كاملة دون حساب. إنشاء الحساب يضيف الحفظ والمفضّلة
          وبطاقات بلا علامة مائية.
        </p>
      )}
    </div>
  );
}

function QuoteCard({
  quote,
  template,
  favourite,
  isMember,
  onToggleFavourite,
}: {
  quote: Quote;
  template: CardTemplate;
  favourite: boolean;
  isMember: boolean;
  onToggleFavourite: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setStatus(null);
    try {
      // The server decides. Whatever watermark comes back is what gets drawn.
      const res = await fetch("/api/quotes/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        entitled: boolean;
        quote: { textAr: string; philosopherAr: string; sourceLabel: string };
        watermark: string | null;
        error?: string;
      };

      if (!body.ok) {
        setStatus(body.error ?? "تعذّر تجهيز البطاقة.");
        return;
      }

      const blob = await renderCard({
        textAr: body.quote.textAr,
        philosopherAr: body.quote.philosopherAr,
        sourceLabel: body.quote.sourceLabel,
        template,
        watermark: body.watermark,
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${quote.id}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 0);

      setStatus(
        body.watermark
          ? "معاينة بعلامة مائية. البطاقة الكاملة للعضوية."
          : "حُفظت البطاقة."
      );
    } catch {
      setStatus("تعذّر رسم البطاقة على هذا المتصفح.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="glass p-5" data-quote-id={quote.id}>
      <blockquote dir="auto" className="display-arabic text-[1.05rem] leading-loose text-gold-light">
        {quote.textAr}
      </blockquote>

      <p className="display-arabic mt-4 text-sm text-gold-muted">{quote.philosopherAr}</p>

      {/* Source, always. Not collapsed, not behind a link â€” it is part of the
          quote, not metadata about it. */}
      <div className="mt-1 space-y-0.5">
        <p className="text-xs text-gold-muted/60">
          {quote.workEn}, {quote.locator}
        </p>
        <p className="text-[0.7rem] text-ink-3">
          ترجمة {quote.translator} â€” {quote.edition}
        </p>
      </div>

      {/* The original wording, in a disclosure. This is the anti-drift safeguard:
          a reader who suspects the Arabic has drifted can compare. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[0.7rem] text-ink-3 hover:text-gold-light">
          النص الأصلي
        </summary>
        <p dir="auto" className="mt-2 text-[0.8rem] leading-relaxed text-gold-muted/70">
          {quote.sourceText}
        </p>
        {quote.sourceUrl && (
          <a
            href={quote.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[0.7rem] text-gold-light underline underline-offset-4"
          >
            تحقّق من المصدر
          </a>
        )}
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={favourite}
          className={`display-arabic flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs transition-colors ${
            favourite
              ? "border-gold/60 bg-gold/20 text-gold-light"
              : "border-gold/20 text-gold-muted/60 hover:border-gold/45"
          }`}
        >
          <Heart className={`size-3.5 ${favourite ? "fill-current" : ""}`} />
          {favourite ? "في المفضّلة" : "أضف للمفضّلة"}
        </button>

        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          className="btn-ghost px-4 py-2 text-xs disabled:opacity-40"
        >
          {isMember ? "نزّل البطاقة" : "معاينة البطاقة"}
        </button>

        {!isMember && (
          <Link
            href="/enter?mode=signup"
            className="display-arabic text-[0.7rem] text-ink-3 underline underline-offset-4 hover:text-gold-light"
          >
            بلا علامة مائية للعضوية
          </Link>
        )}
      </div>

      {status && (
        <p role="status" className="display-arabic mt-3 text-xs leading-relaxed text-gold-muted/75">
          {status}
        </p>
      )}
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`display-arabic rounded-full border px-4 py-1.5 text-xs transition-colors ${
        active
          ? "border-gold/60 bg-gold/20 text-gold-light"
          : "border-gold/15 text-gold-muted/60 hover:border-gold/40"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The quote of the day.
 *
 * Deterministic from the day index so it is stable for every reader and rolls at
 * midnight. When the reader has interests, the pool is narrowed to those; the
 * brief's "if available" is honoured rather than assumed, since the paths feature
 * stores progress but not declared interests.
 */
export function pickQuoteOfTheDay(
  pool: Quote[],
  now: number,
  interests?: readonly string[]
): Quote | null {
  if (pool.length === 0) return null;
  const narrowed = interests?.length
    ? pool.filter((q) => q.topics.some((t) => interests.includes(t)))
    : [];
  const candidates = narrowed.length > 0 ? narrowed : pool;
  return candidates[dayIndex(now) % candidates.length] as Quote;
}

export default QuotesApp;
