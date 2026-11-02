import { VERIFIED_QUOTES } from "./personas";

const normalize = (text: string) => text.normalize("NFC").replace(/[\u064b-\u065f\u0670ـ]/gu, "").replace(/[أإآ]/gu, "ا").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim();

/** Explicit attribution checks only. Interpretive questions stay with the philosopher. */
export function verifyArabicCitation(question: string): string | null {
  const claim = question.trim().match(/^(?:هل\s+(?:قال|كتب)|هل\s+صحيح\s+أن).{1,90}?(?:[:：]\s*|[«“"])([^»”"؟?\n]{4,400})/u);
  if (!claim) return null;
  const target = normalize(claim[1]);
  const record = Object.values(VERIFIED_QUOTES).find(q => normalize(q.textAr) === target);
  return record
    ? `تورد مكتبتنا هذه العبارة بترجمة عربية: «${record.textAr}» — ${record.attributionAr}، ${record.work}.`
    : "لا أملك في مكتبة الموقع مصدراً يوثّق هذه العبارة بهذه الصيغة. إذا وجدت اسم العمل أو النص الأصلي، يمكنك الرجوع إليه للتحقق من النسبة.";
}
