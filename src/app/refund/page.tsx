import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "سياسة الاسترداد",
  description: "متى وكيف يُسترد اشتراك مدفوع في عقل في صندوق، وما الحالات المستثناة.",
  alternates: { canonical: "/refund", languages: { ar: "/refund", en: "/refund" } },
  openGraph: {
    title: "سياسة الاسترداد | عقل في صندوق",
    description: "متى وكيف يُسترد اشتراك مدفوع، وما الحالات المستثناة.",
    url: absoluteUrl("/refund"),
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "principle",
    headingAr: "المبدأ",
    headingEn: "Principle",
    paragraphs: [
      {
        ar: "إذا لم تفدك الخدمة، فعاد إليها مالك. هذه السياسة مكتوبة لتكون مقروءة لا لتكون معقّدة.",
        en: "If the service did not serve you, you should get your money back. This policy is written to be read, not to be made difficult.",
      },
    ],
  },
  {
    id: "window",
    headingAr: "مهلة الاسترداد",
    headingEn: "Refund window",
    paragraphs: [
      {
        ar: "لك أن تطلب استرداداً كاملاً خلال أربعة عشر يوماً من تأكيد الدفع، بشرط ألّا يكون قد استُهلك أكثر من ثلثي حصّتك الشهرية.",
        en: "You may request a full refund within fourteen days of payment confirmation, provided no more than two thirds of your monthly allowance has been used.",
      },
      {
        ar: "بعد انقضاء المهلة، لا يُسترد الاشتراك الشهري إلا إذا توفّر خلل تقني منعك من استخدام الخدمة.",
        en: "After that window, a monthly subscription is not refundable unless a technical fault prevented you from using the service.",
      },
    ],
  },
  {
    id: "how",
    headingAr: "كيف تطلب الاسترداد",
    headingEn: "How to request",
    paragraphs: [
      {
        ar: "راسلنا من بريد الحساب نفسه الذي اشتركت منه، واذكر تاريخ الدفع ومعرّف العملية. لا نطلب منك كلمة مرور، ولا رقم بطاقة كاملة، ولا أي بيانات بنكية.",
        en: "Write to us from the same email address you subscribed with, giving the payment date and the transaction reference. We will never ask for your password, your full card number, or any bank details.",
      },
      {
        ar: "نردّ المبلغ بالطريقة نفسها التي دفعت بها، وقد يستغرق وصوله إلى ثلاثة إلى خمسة أيام عمل حسب مصرفك.",
        en: "We refund by the same method you paid with. It may take three to five business days to appear, depending on your bank.",
      },
    ],
  },
  {
    id: "not-refundable",
    headingAr: "حالات لا تُسترد",
    headingEn: "Non-refundable cases",
    paragraphs: [
      { ar: "لا يشمل الاسترداد ما يلي:", en: "The following are not refundable:" },
    ],
    items: [
      {
        ar: "استهلاك أكثر من ثلثي الحصة خلال مهلة الأربعة عشر يوماً.",
        en: "Use of more than two thirds of your allowance within the fourteen-day window.",
      },
      {
        ar: "استرداد طلب بعد انقضاء المهلة دون خلل تقني.",
        en: "A request made after the window has closed, with no technical fault.",
      },
      {
        ar: "مبالغ دفعها طرف آخر نيابةً عنك، إذ تكون العلاقة بينكما خارج هذه السياسة.",
        en: "Amounts paid by a third party on your behalf, as that relationship falls outside this policy.",
      },
    ],
  },
  {
    id: "chargebacks",
    headingAr: "النزاعات البنكية",
    headingEn: "Chargebacks",
    paragraphs: [
      {
        ar: "نطلب منك ألّا تفتح نزاعاً بنكياً قبل مراسلتنا. فالنزاع البنكي يستغرق أسابيع، ويُخفي عننا سبب المشكلة، ويصعب حلّه.",
        en: "We ask that you not open a bank chargeback before writing to us. A chargeback takes weeks, hides the cause of the problem from us, and is harder to resolve.",
      },
    ],
  },
  {
    id: "changes",
    headingAr: "تعديل هذه السياسة",
    headingEn: "Changes to this policy",
    paragraphs: [
      {
        ar: "تسري النسخة المنشورة على الطلبات المقدَّمة في تاريخه. وأي طلب مقبول وفق نسخة أقدم يبقى مقبولاً ولو تغيّرت السياسة بعده.",
        en: "The published version applies to requests submitted on its date. A request already accepted under an earlier version stays accepted even if the policy later changes.",
      },
    ],
  },
];

export default function RefundPage() {
  return (
    <LegalDocument
      titleAr="سياسة الاسترداد"
      titleEn="Refund Policy"
      updatedAr="آخر تحديث: 3 أكتوبر 2026"
      updatedEn="Last updated: 3 October 2026"
      sections={SECTIONS}
    />
  );
}
