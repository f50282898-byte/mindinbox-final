"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpLeft,
  ArrowUpRight,
  BookOpen,
  MessageCircle,
  NotebookPen,
} from "lucide-react";
import { ArtLayer } from "@/components/art/ArtLayer";
import { ArgumentGame } from "@/components/ArgumentGame";
import { Logo } from "@/components/Logo";
import { LENSES, lensById } from "@/components/lenses/lensToken";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n";
import { AppearanceControls } from "@/components/Header";

export function UtopiaHero() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  const incomingId = params.get("philosopher");
  const incomingQuestion = params.get("q");

  useEffect(() => {
    setSelectedId(lensById(incomingId)?.id ?? null);
    setQuestion(incomingQuestion ?? "");
  }, [incomingId, incomingQuestion]);

  const lens = lensById(selectedId);
  const search = new URLSearchParams();
  if (selectedId) search.set("philosopher", selectedId);
  if (question.trim()) search.set("q", question.trim());
  const target =
    (user ? "/wisdom" : "/enter") + (search.size ? "?" + search.toString() : "");
  const Arrow = ar ? ArrowUpLeft : ArrowUpRight;

  const practices = [
    {
      href: "/wisdom",
      icon: BookOpen,
      title: ar ? "سؤال يفتح أفقاً" : "A question. A new perspective.",
      text: ar
        ? "تأمّل أفكارك من خلال عدسة فلسفية تختارها."
        : "Explore your thoughts through a philosophical lens.",
    },
    {
      href: "/dialogue",
      icon: MessageCircle,
      title: ar ? "فكرتان في حوار" : "Two minds in conversation",
      text: ar
        ? "دع وجهتي نظر تلتقيان حول ما يشغلك."
        : "Let different perspectives meet around your question.",
    },
    {
      href: "/journal",
      icon: NotebookPen,
      title: ar ? "مساحة لما بداخلك" : "Room for your inner world",
      text: ar
        ? "اكتب يومك، راقب عاداتك، وعد إلى نفسك."
        : "Write your day, notice your habits, return to yourself.",
    },
  ];

  return (
    <div className="sanctuary-home">
      {/* Editorial Masthead */}
      <header className="home-masthead">
        <Link
          href="/"
          className="home-brand group"
          aria-label={ar ? "عقل في صندوق — الرئيسية" : "Mind in a Box — Home"}
        >
          <Logo
            size={34}
            ariaLabel={ar ? "عقل في صندوق" : "Mind in a Box"}
            priority
          />
          <span>
            {ar ? "عقل في صندوق" : "Mind in a Box"}
            <small lang="en" className="display-latin">
              A SPACE TO THINK
            </small>
          </span>
        </Link>

        <nav
          className="home-nav"
          aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}
        >
          <Link href="/wisdom" className="nav-link">
            {ar ? "الحكمة" : "Wisdom"}
          </Link>
          <Link href="/journal" className="nav-link">
            {ar ? "المفكرة" : "Journal"}
          </Link>
          <Link href="/paths" className="nav-link">
            {ar ? "اكتشف المسارات" : "Explore paths"}
          </Link>
        </nav>

        <AppearanceControls />
      </header>

      {/* Hero Narrative Experience */}
      <section className="home-hero" aria-labelledby="home-heading">
        <div className="home-copy">
          <p className="home-eyebrow">
            <span aria-hidden="true" />
            {ar ? "مساحة هادئة. أسئلة كبيرة." : "A quieter space. Bigger questions."}
          </p>

          <h1 id="home-heading" aria-label={ar ? "عقل في صندوق" : "Mind in a Box"}>
            {ar ? (
              <>
                ابتعد عن الضجيج.
                <br />
                <em>اقترب من نفسك.</em>
              </>
            ) : (
              <>
                Less noise.
                <br />
                <em>More perspective.</em>
              </>
            )}
          </h1>

          <p className="home-intro">
            {ar
              ? "بعض الأسئلة لا تحتاج إجابة سريعة، بل مساحة للتفكير. حاور الحكمة، دوّن ما يشغلك، وانظر إلى حياتك من زاوية أخرى."
              : "Some questions need more than a quick answer. Explore philosophy, put your thoughts into words, and see your life from another angle."}
          </p>

          {/* Prompt Composer */}
          <div className="home-composer">
            <label htmlFor="hero-q">
              {ar ? "ما السؤال الذي يرافقك اليوم؟" : "What is on your mind today?"}
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                router.push(target);
              }}
            >
              <textarea
                id="hero-q"
                name="question"
                rows={2}
                maxLength={400}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  ar
                    ? "كيف أجد المعنى في يومي…"
                    : "How can I find meaning in my everyday life…"
                }
              />
              <div className="home-composer-bottom">
                <span>
                  {ar
                    ? "ابدأ بسؤال، أو اترك الفضول يقودك"
                    : "Bring a question, or simply your curiosity"}
                </span>
                <button className="home-primary" type="submit">
                  {ar ? "ابدأ التأمل" : "Start reflecting"}
                  <Arrow size={18} aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>

          {/* Canonical Philosopher Lenses */}
          <fieldset
            className="home-lenses"
            aria-label={ar ? "اختر فيلسوفك" : "Choose your philosopher"}
          >
            <legend>{ar ? "اختر زاوية النظر" : "Choose your perspective"}</legend>
            {LENSES.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={selectedId === item.id}
                onClick={() =>
                  setSelectedId(selectedId === item.id ? null : item.id)
                }
                className={selectedId === item.id ? "home-lens-active" : undefined}
              >
                <Image
                  src={`/images/philosophers/${item.id}-160.webp`}
                  alt=""
                  width={22}
                  height={22}
                  unoptimized
                  className="home-lens-avatar"
                />
                <span aria-hidden="true">{item.symbol}</span>
                {ar ? item.nameAr : item.nameEn}
              </button>
            ))}
          </fieldset>
        </div>

        {/* Cinematography Portal Art */}
        <aside
          className="home-art"
          aria-label={ar ? "مساحة للتأمل" : "A space for reflection"}
        >
          <ArtLayer id="colonnade" opacity={0.16} eager={true} />
          <div className="home-art-index" aria-hidden="true">
            <span>MI / 01</span>
            <span>THE INNER WORLD</span>
          </div>

          <div className="home-portal" aria-hidden="true">
            <div className="home-orbit" />
            <div className="home-portal-artwork">
              {lens ? (
                <picture>
                  <source
                    srcSet={`/images/philosophers/${lens.id}-320.avif`}
                    type="image/avif"
                  />
                  <source
                    srcSet={`/images/philosophers/${lens.id}-320.webp`}
                    type="image/webp"
                  />
                  <img
                    src={`/images/philosophers/${lens.id}.webp`}
                    alt={ar ? lens.nameAr : lens.nameEn}
                    loading="eager"
                    decoding="async"
                    width={180}
                    height={180}
                    className="home-portal-img"
                  />
                </picture>
              ) : (
                <picture>
                  <source
                    srcSet="/images/hero/hero-sanctuary-640.avif 640w, /images/hero/hero-sanctuary-1024.avif 1024w"
                    type="image/avif"
                    sizes="(max-width: 768px) 180px, 240px"
                  />
                  <source
                    srcSet="/images/hero/hero-sanctuary-640.webp 640w, /images/hero/hero-sanctuary-1024.webp 1024w"
                    type="image/webp"
                    sizes="(max-width: 768px) 180px, 240px"
                  />
                  <img
                    src="/images/hero/hero-sanctuary-640.webp"
                    alt={
                      ar
                        ? "المحراب الفلسفي — اعرف نفسك"
                        : "The Philosophical Sanctuary — Know Thyself"
                    }
                    width={180}
                    height={180}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="home-portal-img"
                  />
                </picture>
              )}
            </div>
            <div className="home-plinth" />
            <span className="home-star">✦</span>
          </div>

          <div className="home-art-caption" aria-live="polite">
            <span className="home-eyebrow">
              {lens
                ? ar
                  ? lens.nameAr
                  : lens.nameEn
                : ar
                ? "لحظة خارج الضجيج"
                : "A moment beyond the noise"}
            </span>
            <p>
              {ar
                ? (lens?.lineAr ?? "امنح أفكارك مساحة لتتّسع.")
                : "Give your thoughts room to unfold."}
            </p>
            {ar && lens?.lineIsQuote && <small>{lens.attributionAr}</small>}
          </div>
        </aside>
      </section>

      {/* Hairline Divider */}
      <div className="home-section-rule" aria-hidden="true" />

      {/* Three Practices Section */}
      <section
        className="home-practices"
        aria-label={ar ? "مسارات التأمل" : "Ways to reflect"}
      >
        {practices.map((item, i) => (
          <Link
            href={item.href}
            key={item.href}
            className="home-practice group"
          >
            <span className="home-practice-number">0{i + 1}</span>
            <item.icon size={23} strokeWidth={1.4} aria-hidden="true" />
            <div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </div>
            <Arrow size={18} aria-hidden="true" className="practice-arrow" />
          </Link>
        ))}
      </section>

      {/* Hairline Divider */}
      <div className="home-section-rule" aria-hidden="true" />

      {/* Reading Table Section */}
      <section className="reading-table" aria-labelledby="reading-table-title">
        <div className="reading-heading">
          <p className="home-eyebrow">
            {ar
              ? "من دفتر المحرّر · العدد الأول"
              : "From the editor’s notebook · Issue 01"}
          </p>
          <h2 id="reading-table-title">
            {ar ? "تمرين في فنّ الاختيار" : "A practice in choosing"}
          </h2>
          <p>
            {ar
              ? "خذ قراراً صغيراً من يومك واقرأه بثلاث طرق. اختر بطاقة لتبدأ، ويمكنك تعديل السؤال قبل إرساله."
              : "Take one small decision from today and look at it three ways. Choose a card, then make the question your own."}
          </p>
        </div>

        <div className="reading-cards">
          {[
            [
              ar ? "سمِّ ما تملك" : "Name your agency",
              ar
                ? "أي جزء من قراري أستطيع تغييره اليوم؟"
                : "Which part of my decision can I change today?",
            ],
            [
              ar ? "اختبر افتراضك" : "Test an assumption",
              ar
                ? "ما الدليل الذي قد يجعلني أغيّر رأيي في هذا القرار؟"
                : "What evidence would change my mind about this decision?",
            ],
            [
              ar ? "اكتب لصديق" : "Write to a friend",
              ar
                ? "ماذا سأقول لصديق يواجه القرار نفسه، ولماذا؟"
                : "What would I tell a friend facing this choice, and why?",
            ],
          ].map(([title, prompt], index) => (
            <button
              type="button"
              key={title}
              onClick={() => {
                setQuestion(prompt);
                document.getElementById("hero-q")?.focus();
              }}
              className="group"
            >
              <small aria-hidden="true" className="display-latin">
                0{index + 1} / 03
              </small>
              <strong>{title}</strong>
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Hairline Divider */}
      <div className="home-section-rule" aria-hidden="true" />

      {/* Argument Lab */}
      <ArgumentGame ar={ar} />

      {/* Hairline Divider */}
      <div className="home-section-rule" aria-hidden="true" />

      {/* Film Screenings / Member Cinema */}
      <details className="portrait-screening">
        <summary>
          <span>
            {ar ? "معرض الوجوه · فيلمان قصيران" : "Portrait gallery · Two short films"}
          </span>
        </summary>
        <div className="portrait-films">
          {[
            {
              id: "questions",
              poster: "plato",
              title: ar ? "بين السؤال والحكاية" : "Between question and fable",
              names: ar ? "أفلاطون وإيسوب" : "Plato and Aesop",
            },
            {
              id: "inner-life",
              poster: "rumi",
              title: ar ? "وجهان للحياة الداخلية" : "Two views of the inner life",
              names: ar ? "الرومي ودوستويفسكي" : "Rumi and Dostoevsky",
            },
          ].map((film) => (
            <figure key={film.id}>
              <video
                controls
                playsInline
                preload="none"
                width="640"
                height="428"
                aria-label={film.title}
                poster={`/images/philosophers/${film.poster}-480.webp`}
              >
                <source src={`/media/${film.id}.webm`} type="video/webm" />
              </video>
              <figcaption>
                <strong>{film.title}</strong>
                <span>{film.names}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </details>

      {/* Home Footer */}
      <footer className="home-footer">
        <span>
          {ar
            ? "عقل في صندوق — مساحة للتفكير، على مهل."
            : "Mind in a Box — space to think, at your own pace."}
        </span>
        <Link href="/privacy">{ar ? "خصوصيتك" : "Your privacy"}</Link>
        <Link href="/pricing">{ar ? "العضويات" : "Membership"}</Link>
      </footer>
    </div>
  );
}

export default UtopiaHero;
