import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description:
    "ما البيانات التي نجمعها في عقل في صندوق، ولماذا تُرسل إلى مزوّدي الذكاء الاصطناعي، وما حقوقك فيها.",
  alternates: { canonical: "/privacy", languages: { ar: "/privacy", en: "/privacy" } },
  openGraph: {
    title: "سياسة الخصوصية | عقل في صندوق",
    description: "ما نجمعه، ولماذا يُرسل إلى مزوّدي الذكاء الاصطناعي، وما حقوقك.",
    url: absoluteUrl("/privacy"),
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "summary",
    headingAr: "الخلاصة",
    headingEn: "Summary",
    paragraphs: [
      {
        ar: "عقل في صندوق تطبيق لتأمّل فلسفي بالذكاء الاصطناعي. تكتب لنفسك، ثم تختار صراحةً إرسال ما كتبته إلى نموذج ذكاء اصطناعي لتحصل على قراءة فيلسوفية. هذه هي العملية الجوهرية، وليست تفصيلاً تقنياً.",
        en: "Mind in a Box is an AI-assisted philosophical reflection app. You write for yourself, then explicitly choose to send what you wrote to an AI model to receive a philosopher's reading. That is the core operation, not a technical footnote.",
      },
      {
        ar: "نحن لا نبيع بياناتك ولا نؤجّرها ولا نستخدم محتواك لتدريب نماذجنا أو نماذج مزوّدينا.",
        en: "We do not sell your data, rent it out, or use your content to train our models or our providers' models.",
      },
    ],
  },
  {
    id: "ai-transfer",
    headingAr: "إرسال نصوصك إلى مزوّدي الذكاء الاصطناعي",
    headingEn: "Your text is sent to AI providers",
    paragraphs: [
      {
        ar: "هذا أهم بند في هذه السياسة. حين تكتب في المفكرة أو المتتبع أو الحوار، يُرسَل نصّك عبر خوادمنا إلى مزوّد خارجي لنماذج الذكاء الاصطناعي لينتج الرد. قد يكون هذا المزوّد مشغّل خدمة سحابية معرّفاً في واجهاته.",
        en: "This is the most important clause in this policy. When you write in the journal, the tracker, or a dialogue, your text is sent through our servers to a third-party AI model provider in order to generate a response. That provider may be an operator of a cloud service identified in its own terms.",
      },
      {
        ar: "للمزوّد أن يحتفظ بما يستقبله وفق سياسته الخاصة، وأن يحدّد ما الذي يُحفظ وكم مدة، وأن يغيّر ذلك لاحقاً. لذلك لا تكتب في هذه الخدمة ما لا تريد أن يصل إلى طرف ثالث.",
        en: "The provider may retain what it receives under its own policy, may decide what is stored and for how long, and may change that later. Therefore, do not write into this service anything you would not want reaching a third party.",
      },
      {
        ar: "اخترنا مزوّداً يلتزم بعدم استخدام مدخلات المستخدم في التدريب. لكن هذا التزام تعاقدي مع طرف خارجي، لا تقنية نتحكم بها، ولا نستطيع ضمانه نيابةً عنك.",
        en: "We selected a provider that undertakes not to train on user input. But that is a contractual commitment with a third party, not a technology we control, and we cannot guarantee it on your behalf.",
      },
    ],
  },
  {
    id: "collected",
    headingAr: "ما نجمعه",
    headingEn: "What we collect",
    paragraphs: [
      { ar: "نجمع أقل ما يمكن وما يلزم للخدمة:", en: "We collect the least we can and only what the service needs:" },
    ],
    items: [
      {
        ar: "الحساب: مُعرّف مجهول من Firebase، وبريدك الإلكتروني إن سجّلت الدخول، وحالة اشتراكك.",
        en: "Account: a Firebase anonymous identifier, your email address if you sign in, and your subscription status.",
      },
      {
        ar: "المحتوى: ما تكتبه في المفكرة أو المتتبع، وردود النموذج عليها.",
        en: "Content: what you write in the journal or tracker, and the model responses to it.",
      },
      {
        ar: "بيانات تقنية: نوع جهازك، وإصدار المتصفح، وعنوان IP التقريبي — لأغراض التشخيص والأمان.",
        en: "Technical data: your device type, browser version, and approximate IP address, for diagnostics and security.",
      },
      {
        ar: "بيانات الاستهلاك: عدد مرات استخدامك للخدمة — لأغراض الحصة والقياس.",
        en: "Usage data: how many times you used the service, for quota and metering purposes.",
      },
    ],
  },
  {
    id: "not-collected",
    headingAr: "ما لا نجمعه",
    headingEn: "What we do not collect",
    paragraphs: [
      {
        ar: "لا نطلب اسمك الحقيقي ولا عنوانك ولا تاريخ ميلادك ولا أرقام بطاقتك. ولا نبني عنك ملفاً عن الصحة أو الدين أو التوجّه السياسي.",
        en: "We do not ask for your real name, address, date of birth, or card details. We do not build a profile of your health, religion, or political orientation.",
      },
    ],
  },
  {
    id: "admin-visibility",
    headingAr: "ما يراه مشغّل الخدمة",
    headingEn: "What the service operator can see",
    paragraphs: [
      {
        ar: "المشغّل طرف ثالث بالنسبة إليك، ولا يمكن أن نعدك بأنه لن يفتح محتواك.",
        en: "The operator is a third party with respect to you, and we cannot promise you they will never open your content.",
      },
      {
        ar: "نوضّح هنا المبدأ الذي نلتزم به: الإدارة لا تقرأ نصّ المفكرة أو المتتبع سطراً سطراً، ووصولها محصور بالبيانات المجمّعة.",
        en: "Here is the principle we hold ourselves to: administration must not read raw journal or tracker text line by line, and its access is limited to aggregates.",
      },
      {
        ar: "إقرار صريح: القاعدة أعلاه مطبَّقة بالكامل على المفكرة الجديدة — أيامك وعاداتك ومبادئك وإعداداتك محجوبة عن الإدارة عند مستوى قاعدة البيانات، ولا يستطيع أي مشرف قراءتها. لكنها ليست مطبَّقة على المجموعات القديمة (entries وevents وpuzzles) بعد، لأنها كانت موجودة قبل هذا المبدأ. يجب إصلاح ذلك قبل أي إطلاق عام.",
        en: "Explicit disclosure: the rule above is fully enforced for the current journal — your days, habits, principles and settings are closed to administration at the database level, and no operator can read them. It is not yet enforced for the older collections (entries, events, puzzles), which predate the rule. That must be fixed before any public launch.",
      },
    ],
  },
  {
    id: "retention",
    headingAr: "مدة الاحتفاظ",
    headingEn: "Retention",
    paragraphs: [
      {
        ar: "يبقى محتواك في حسابك حتى تحذفه أو تحذف حسابك. بيانات الاستهلاك تُحفظ مدة محدودة ثم تُجمَّع إحصائياً.",
        en: "Your content stays in your account until you delete it or delete your account. Usage data is kept for a limited period and then aggregated.",
      },
    ],
  },
  {
    id: "rights",
    headingAr: "حقوقك",
    headingEn: "Your rights",
    paragraphs: [
      {
        ar: "لك أن تطلب نسخة من بياناتك، أو تصحيحها، أو حذفها، أو الاعتراض على معالجتها. تحقّق من هذه الحقوق عبر بريد التواصل الموضّح في صفحة الشروط.",
        en: "You may request a copy of your data, correct it, delete it, or object to its processing. Exercise these rights through the contact address given on the Terms page.",
      },
      {
        ar: "هذه النسخة من الخدمة مدعومة على منصة سحابية خارج中国大陆، وقد تنطبق قوانين مختلفة على بياناتك بحسب مكان إقامتك.",
        en: "This version of the service runs on a cloud platform outside mainland China, and different laws may apply to your data depending on where you live.",
      },
    ],
  },
  {
    id: "changes",
    headingAr: "تعديل هذه السياسة",
    headingEn: "Changes to this policy",
    paragraphs: [
      {
        ar: "قد نحدّث هذه السياسة. سنغيّر تاريخ آخر تحديث في أعلى الصفحة، ونعرض تنبيهاً واضحاً داخل التطبيق عند أي تغيير جوهري.",
        en: "We may update this policy. We will change the last-updated date at the top of this page and show a clear in-app notice for any material change.",
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      titleAr="سياسة الخصوصية"
      titleEn="Privacy Policy"
      updatedAr="آخر تحديث: 3 أكتوبر 2026"
      updatedEn="Last updated: 3 October 2026"
      sections={SECTIONS}
    />
  );
}
