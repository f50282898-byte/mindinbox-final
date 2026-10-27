"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpLeft, BookOpen, MessageCircle, NotebookPen, ArrowUpRight } from "lucide-react";
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
  const target = (user ? "/wisdom" : "/enter") + (search.size ? "?" + search.toString() : "");
  const Arrow = ar ? ArrowUpLeft : ArrowUpRight;
  const practices = [
    { href: "/wisdom", icon: BookOpen, title: ar ? "سؤال يفتح أفقاً" : "A question. A new perspective.", text: ar ? "تأمّل أفكارك من خلال عدسة فلسفية تختارها." : "Explore your thoughts through a philosophical lens." },
    { href: "/dialogue", icon: MessageCircle, title: ar ? "فكرتان في حوار" : "Two minds in conversation", text: ar ? "دع وجهتي نظر تلتقيان حول ما يشغلك." : "Let different perspectives meet around your question." },
    { href: "/journal", icon: NotebookPen, title: ar ? "مساحة لما بداخلك" : "Room for your inner world", text: ar ? "اكتب يومك، راقب عاداتك، وعد إلى نفسك." : "Write your day, notice your habits, return to yourself." },
  ];
  return (
    <div className="sanctuary-home">
      <header className="home-masthead">
        <Link href="/" className="home-brand" aria-label={ar ? "عقل في صندوق — الرئيسية" : "Mind in a Box — Home"}>
          <Logo size={34} ariaLabel={ar ? "عقل في صندوق" : "Mind in a Box"} />
          <span>{ar ? "عقل في صندوق" : "Mind in a Box"}<small lang="en">A SPACE TO THINK</small></span>
        </Link>
        <nav className="home-nav" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          <Link href="/wisdom">{ar ? "الحكمة" : "Wisdom"}</Link>
          <Link href="/journal">{ar ? "المفكرة" : "Journal"}</Link>
          <Link href="/paths">{ar ? "اكتشف المسارات" : "Explore paths"}</Link>
        </nav>
        <AppearanceControls />
      </header>
      <section className="home-hero" aria-labelledby="home-heading">
        <div className="home-copy">
          <p className="home-eyebrow"><span />{ar ? "مساحة هادئة. أسئلة كبيرة." : "A quieter space. Bigger questions."}</p>
          <h1 id="home-heading">{ar ? <>ابتعد عن الضجيج.<br /><em>اقترب من نفسك.</em></> : <>Less noise.<br /><em>More perspective.</em></>}</h1>
          <p className="home-intro">{ar ? "بعض الأسئلة لا تحتاج إجابة سريعة، بل مساحة للتفكير. حاور الحكمة، دوّن ما يشغلك، وانظر إلى حياتك من زاوية أخرى." : "Some questions need more than a quick answer. Explore philosophy, put your thoughts into words, and see your life from another angle."}</p>
          <div className="home-composer">
            <label htmlFor="hero-q">{ar ? "ما السؤال الذي يرافقك اليوم؟" : "What is on your mind today?"}</label>
            <form onSubmit={(event) => { event.preventDefault(); router.push(target); }}>
              <textarea id="hero-q" name="question" rows={2} maxLength={400} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={ar ? "كيف أجد المعنى في يومي…" : "How can I find meaning in my everyday life…"} />
              <div className="home-composer-bottom">
                <span>{ar ? "ابدأ بسؤال، أو اترك الفضول يقودك" : "Bring a question, or simply your curiosity"}</span>
                <button className="home-primary" type="submit">{ar ? "ابدأ التأمل" : "Start reflecting"}<Arrow size={18} aria-hidden="true" /></button>
              </div>
            </form>
          </div>
          <fieldset className="home-lenses">
            <legend>{ar ? "اختر زاوية النظر" : "Choose your perspective"}</legend>
            {LENSES.map((item) => <button type="button" key={item.id} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}><span aria-hidden="true">{item.symbol}</span>{ar ? item.nameAr : item.nameEn}</button>)}
          </fieldset>
        </div>
        <aside className="home-art" aria-label={ar ? "مساحة للتأمل" : "A space for reflection"}>
          <div className="home-art-index" aria-hidden="true"><span>MI / 01</span><span>THE INNER WORLD</span></div>
          <div className="home-portal" aria-hidden="true"><div className="home-orbit" /><div className="home-sphere" /><div className="home-plinth" /><span className="home-star">✦</span></div>
          <div className="home-art-caption" aria-live="polite">
            <span className="home-eyebrow">{lens ? (ar ? lens.nameAr : lens.nameEn) : (ar ? "لحظة خارج الضجيج" : "A moment beyond the noise")}</span>
            <p>{ar ? (lens?.lineAr ?? "امنح أفكارك مساحة لتتّسع.") : "Give your thoughts room to unfold."}</p>
            {ar && lens?.lineIsQuote && <small>{lens.attributionAr}</small>}
          </div>
        </aside>
      </section>
      <section className="home-practices" aria-label={ar ? "مسارات التأمل" : "Ways to reflect"}>
        {practices.map((item, i) => <Link href={item.href} key={item.href} className="home-practice"><span className="home-practice-number">0{i + 1}</span><item.icon size={23} strokeWidth={1.4} aria-hidden="true" /><div><h2>{item.title}</h2><p>{item.text}</p></div><Arrow size={18} aria-hidden="true" /></Link>)}
      </section>
      <footer className="home-footer"><span>{ar ? "عقل في صندوق — مساحة للتفكير، على مهل." : "Mind in a Box — space to think, at your own pace."}</span><Link href="/privacy">{ar ? "خصوصيتك" : "Your privacy"}</Link><Link href="/pricing">{ar ? "العضويات" : "Membership"}</Link></footer>
    </div>
  );
}
export default UtopiaHero;
