"use client";

import { useState } from "react";

const rounds = [
  {
    claim: ["كل قرار شائع قرار حكيم.", "Every popular decision is a wise one."],
    choices: [
      ["كم شخصاً اتخذ هذا القرار؟", "How many people made the decision?"],
      ["هل اتفق كثيرون يوماً على قرار سيئ؟", "Have many people ever agreed on a bad decision?"],
    ],
    correct: 1,
    reason: [
      "تكفي حالة واحدة تجتمع فيها الشعبية وسوء القرار لنقض كلمة «كل».",
      "One popular but unwise decision is enough to challenge the word ‘every’.",
    ],
  },
  {
    claim: ["صمت صديقي، فلا بد أنه يرفض رأيي.", "My friend was silent, so they must disagree."],
    choices: [
      ["ما تفسير الصمت غير الرفض؟", "What else might explain silence?"],
      ["هل أرفع صوتي كي يجيب؟", "Should I speak louder to get a reply?"],
    ],
    correct: 0,
    reason: [
      "قد يكون الصديق يفكّر. وجود تفسير بديل يكشف المسافة بين الملاحظة والاستنتاج.",
      "The friend might be thinking. An alternative explanation separates the observation from the inference.",
    ],
  },
  {
    claim: ["أعطت القاعدة الجميع الوقت نفسه، فهي عادلة.", "The rule gives everyone equal time, so it is fair."],
    choices: [
      ["هل كتبت القاعدة بلغة واضحة؟", "Is the rule clearly written?"],
      ["هل تقتضي العدالة دائماً معاملة متطابقة؟", "Does fairness always require identical treatment?"],
    ],
    correct: 1,
    reason: [
      "الحجة تفترض أن المساواة في الوقت تحقق العدالة. هنا يبدأ النقاش في معنى العدالة نفسه.",
      "The claim assumes equal time is fair. Testing that assumption opens a discussion about what fairness requires.",
    ],
  },
];

export function ArgumentGame({ ar }: { ar: boolean }) {
  const [round, setRound] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const lang = ar ? 0 : 1;
  const current = rounds[round];
  const finished = round === rounds.length;

  function advance() {
    setPick(null);
    if (finished) {
      setRound(0);
      setScore(0);
    } else {
      setRound(round + 1);
    }
  }

  return (
    <section className="argument-game" aria-labelledby="argument-title">
      <p className="home-eyebrow">
        <span aria-hidden="true" />
        {ar ? "مختبر الحُجّة · ثلاث جولات" : "Argument lab · Three rounds"}
      </p>
      <h2 id="argument-title">
        {ar ? "أيّ سؤال يختبر الفكرة؟" : "Which question tests the idea?"}
      </h2>
      <div aria-live="polite">
        {finished ? (
          <p className="text-base leading-relaxed text-ink-2 my-4">
            {ar ? "اخترت السؤال الأدق في" : "You identified the stronger question in"}{" "}
            <strong className="text-gold font-bold">{score}</strong> / {rounds.length}{" "}
            {ar ? "جولات." : "rounds."}
          </p>
        ) : (
          <>
            <small className="display-latin block text-xs text-ink-3 mb-2">
              0{round + 1} / 0{rounds.length}
            </small>
            <blockquote>{current.claim[lang]}</blockquote>
          </>
        )}
      </div>

      {!finished && (
        <div className="argument-choices">
          {current.choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={pick === i}
              disabled={pick !== null}
              onClick={() => {
                setPick(i);
                if (i === current.correct) setScore(score + 1);
              }}
              className="min-h-[44px] transition-all"
            >
              {choice[lang]}
            </button>
          ))}
        </div>
      )}

      <div role="status">
        {!finished && pick !== null && (
          <p>
            <strong>
              {pick === current.correct
                ? ar
                  ? "نعم. "
                  : "Exactly. "
                : ar
                ? "لنجرب زاوية أخرى. "
                : "Consider another angle. "}
            </strong>
            {current.reason[lang]}
          </p>
        )}
      </div>

      {(finished || pick !== null) && (
        <button
          type="button"
          className="home-primary min-h-[44px] mt-4"
          onClick={advance}
        >
          {finished
            ? ar
              ? "العب مجدداً"
              : "Play again"
            : round === rounds.length - 1
            ? ar
              ? "اعرض النتيجة"
              : "See result"
            : ar
            ? "الجولة التالية"
            : "Next round"}
        </button>
      )}
    </section>
  );
}

export default ArgumentGame;
