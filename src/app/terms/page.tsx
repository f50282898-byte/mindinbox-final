import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "شروط الاستخدام",
  description: "شروط استخدام عقل في صندوق: طبيعة الخدمة، وحدود استخدامها، ومسؤولية المستخدم.",
  alternates: { canonical: "/terms", languages: { ar: "/terms", en: "/terms" } },
  openGraph: {
    title: "شروط الاستخدام | عقل في صندوق",
    description: "طبيعة الخدمة، وحدود استخدامها، ومسؤولية المستخدم.",
    url: absoluteUrl("/terms"),
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "nature",
    headingAr: "طبيعة الخدمة",
    headingEn: "Nature of the service",
    paragraphs: [
      {
        ar: "عقل في صندوق أداة تأمّل فلسفي، وليست استشارة نفسية ولا طبّية ولا قانونية ولا مالية. ما تكتبه وتناقشه هنا نشاط فكري، لا تشخيص ولا وصفة ولا رأي ملزم.",
        en: "Mind in a Box is a philosophical reflection tool. It is not psychological, medical, legal, or financial advice. What you write and discuss here is an intellectual activity, not a diagnosis, a prescription, or a binding opinion.",
      },
      {
        ar: "الردود يولّدها نموذج ذكاء اصطناعي يتكلم بلغة الفلسفة. النموذج قد يخطئ، وقد يكون مقتنعاً وهو مخطئ، وقد ينتج كلاماً يبدو عميقاً وهو فارغ. القراءة الفلسفية تُحفّظ على التأمّل، لا على اليقين.",
        en: "Responses are produced by an AI model speaking in the register of philosophy. The model can be wrong, can be confidently wrong, and can produce sentences that sound profound while being empty. A philosophical reading is an aid to reflection, never a source of certainty.",
      },
    ],
  },
  {
    id: "acceptance",
    headingAr: "قبول الشروط",
    headingEn: "Acceptance",
    paragraphs: [
      {
        ar: "باستخدامك الخدمة فأنت تقرّ بأنك قرأت هذه الشروط وسياسة الخصوصية وفهمتهما. إن لم توافق، لا تستخدم الخدمة.",
        en: "By using the service you confirm that you have read and understood these Terms and the Privacy Policy. If you do not agree, do not use the service.",
      },
      {
        ar: "يجب أن تبلغ ثمانية عشر عاماً على الأقل لاستخدام هذه الخدمة.",
        en: "You must be at least eighteen years old to use this service.",
      },
    ],
  },
  {
    id: "your-content",
    headingAr: "محتواك",
    headingEn: "Your content",
    paragraphs: [
      {
        ar: "يبقى ما تكتبه ملكاً لك. أنت تمنحنا فقط الترخيص الضروري لتشغيل الخدمة عليك: تخزين نصّك وتمريره إلى مزوّد الذكاء الاصطناعي لإنتاج الرد.",
        en: "What you write remains yours. You grant us only the licence necessary to operate the service for you: storing your text and passing it to the AI provider to generate a response.",
      },
      {
        ar: "أنت وحدك مسؤول عمّا تكتبه. لا تكتب في الخدمة ما يخالف القانون، ولا ما ينتهك حقّ الغير.",
        en: "You alone are responsible for what you write. Do not write anything unlawful, and nothing that infringes another's rights.",
      },
    ],
  },
  {
    id: "prohibited",
    headingAr: "استخدام محظور",
    headingEn: "Prohibited use",
    paragraphs: [
      { ar: "يُمنع ما يلي:", en: "The following is prohibited:" },
    ],
    items: [
      {
        ar: "استخدام الخدمة في تشخيص مرض نفسي أو في علاجه.",
        en: "Using the service to diagnose or treat a mental illness.",
      },
      {
        ar: "محاولة تجاوز الحصة أو الوصول إلى مستوى مدفوع بدفع غير مصرّح به.",
        en: "Attempting to bypass quota or gain paid-tier access through unauthorised payment.",
      },
      {
        ar: "إعادة نشر ردود التطبيق على أنها كلامك، أو نسبتها إلى عالم أو جهة بعينها.",
        en: "Republishing model responses as your own words, or attributing them to a specific person or organisation.",
      },
      {
        ar: "محاولة الوصول إلى حسابات الآخرين أو لوحة الإدارة.",
        en: "Attempting to access another user's account or the admin console.",
      },
      {
        ar: "استخدام الخدمة في أغراض مخالفة للقوانين المطبّقة في محل إقامتك.",
        en: "Using the service for purposes unlawful where you reside.",
      },
    ],
  },
  {
    id: "third-party",
    headingAr: "مزوّدو الطرف الثالث",
    headingEn: "Third-party providers",
    paragraphs: [
      {
        ar: "الخدمة تعتمد على مزوّدين خارجيين: مزوّد نماذج الذكاء الاصطناعي، ومنصّة تخزين وبيانات، ومنصّة استضافة. يخضعون جميعاً لشروطهم الخاصة إضافةً إلى هذه الشروط.",
        en: "The service relies on external providers: an AI model provider, a storage and data platform, and a hosting platform. All of them are additionally subject to their own terms.",
      },
      {
        ar: "نوضّح في سياسة الخصوصية أن نصّك يُرسل إلى مزوّد الذكاء الاصطناعي. اقرأ تلك السياسة قبل أن تكتب أي شيء ذي قيمة.",
        en: "The Privacy Policy explains that your text is sent to the AI provider. Read it before writing anything you value.",
      },
    ],
  },
  {
    id: "payments",
    headingAr: "الاشتراكات والدفع",
    headingEn: "Subscriptions and payment",
    paragraphs: [
      {
        ar: "تسري المستويات المدفوعة على فترة شهرية تبدأ من يوم تأكيد الدفع. والتجديد تلقائي ما لم تُلغِ قبل موعد التجديد.",
        en: "Paid tiers run monthly, starting on the day payment is confirmed. They renew automatically unless you cancel before the renewal date.",
      },
    ],
  },
  {
    id: "availability",
    headingAr: "التوافر والتغييرات",
    headingEn: "Availability and changes",
    paragraphs: [
      {
        ar: "الخدمة مقدَّمة كما هي. قد نوقفها أو نغيّر مزاياها أو نلغي مستوى كاملاً. سنخطرك قبل أي تغيير جوهري يؤثّر في اشتراكك المدفوع.",
        en: "The service is provided as-is. We may suspend it, change features, or discontinue a tier entirely. We will notify you before any material change that affects a paid subscription.",
      },
      {
        ar: "نسعى لاستمرارية الخدمة لكن لا نضمنها. وقد تتأثر الخدمة بصيانة أو انقطاع لدى مزوّد خارجي.",
        en: "We aim for continuity but do not guarantee it. The service may be affected by maintenance or by outages at a third-party provider.",
      },
    ],
  },
  {
    id: "liability",
    headingAr: "حدود المسؤولية",
    headingEn: "Limitation of liability",
    paragraphs: [
      {
        ar: "إلى الحدّ الذي يسمح به القانون، لا نتحمّل مسؤولية عن أي خسارة ناتجة عن استخدام الخدمة أو عن الاعتماد على ردٍّ أنتجته. ولا يستبعد هذا الحدّ أي مسؤولية لا يجوز استبعادها قانوناً.",
        en: "To the extent permitted by law, we are not liable for any loss arising from your use of the service or from relying on a response it produced. Nothing here excludes a liability that cannot lawfully be excluded.",
      },
    ],
  },
  {
    id: "contact",
    headingAr: "التواصل",
    headingEn: "Contact",
    paragraphs: [
      {
        ar: "لأي سؤال عن هذه الشروط، راسلنا على العنوان المُدرج في صفحة الحساب بعد تسجيل الدخول.",
        en: "For any question about these Terms, contact us at the address listed on the account page once signed in.",
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      titleAr="شروط الاستخدام"
      titleEn="Terms of Use"
      updatedAr="آخر تحديث: 3 أكتوبر 2026"
      updatedEn="Last updated: 3 October 2026"
      sections={SECTIONS}
    />
  );
}
