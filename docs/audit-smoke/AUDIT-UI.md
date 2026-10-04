# AUDIT-UI — فحص الواجهة كما يراه المستخدم

فحص آلي بمتصفح حقيقي. **12 زيارة** = 17 مسار × 3 نافذة × 2 ثيم × 2 لغة، إضافة إلى مرور تفاعلي فوق كل زر ورابط. المدة 44ث.

**مصدر المسارات:** `src/lib/nav.ts` (`INDEXABLE_ROUTES`) — لا `sitemap.xml`. الـ sitemap يستبعد `/account` عمداً ويُسقط مسارات Firebase الثلاثة حين لا تكون مهيّأة (القاعدة D66)، فقراءة منه كانت ستُسقط `/enter` و`/tracker` و`/journal` من الفحص — وهي بالضبط الصفحات التي تعرض حالتها المتدهورة الآن. هذا الفحص يجيب «ما الذي يصل إليه مستخدم؟»، لا «ماذا نريد لمحرك بحث أن يراه؟».

## الخلاصة

| | العدد |
|---|---|
| **P0** | 0 |
| **P1** | 3 |
| **P2** | 6 |
| **P3** | 0 |

زيارات ناجحة **12/12** · زيارات فيها خطأ طرفية **0** · زيارات فيها طلب فاشل **0** · زيارات فيها تمرير أفقي **0** · مخالفات axe **1 نوع

الضغط التفاعلي: **0 ضغطة** على أزرار وروابط وحوافز. وكل عنصر كان قابلاً للضغط على حالة تحميل نظيفة.

## التغطية — كل مسار في 12 تركيبة

| المسار | 360 داكن/ع | 360 فاتح/ع | 360 داكن/en | 360 فاتح/en | 768 داكن/ع | 768 فاتح/en | 1440 داكن/ع | 1440 فاتح/en | الحالة |
|---|---|---|---|---|---|---|---|---|---|
| `/` | — | — | — | — | — | — | — | — | طبيعي |
| `/enter` | — | — | — | — | — | — | — | — | طبيعي |
| `/wisdom` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | طبيعي |
| `/dialogue` | — | — | — | — | — | — | — | — | طبيعي |
| `/journal` | — | — | — | — | — | — | — | — | طبيعي |
| `/tracker` | — | — | — | — | — | — | — | — | طبيعي |
| `/paths` | — | — | — | — | — | — | — | — | طبيعي |
| `/quotes` | — | — | — | — | — | — | — | — | طبيعي |
| `/pricing` | — | — | — | — | — | — | — | — | طبيعي |
| `/privacy` | — | — | — | — | — | — | — | — | طبيعي |
| `/terms` | — | — | — | — | — | — | — | — | طبيعي |
| `/refund` | — | — | — | — | — | — | — | — | طبيعي |
| `/oracle` | — | — | — | — | — | — | — | — | طبيعي |
| `/sanctum` | — | — | — | — | — | — | — | — | طبيعي |
| `/account` | — | — | — | — | — | — | — | — | طبيعي |
| `/god-mode-admin` | — | — | — | — | — | — | — | — | طبيعي |
| `/membership` | — | — | — | — | — | — | — | — | طبيعي |

`✓` صفحة كاملة · `⚠` تعمل لكن بخطأ في الطرفية · `✗` عطل · «بلا Firebase» = الصفحة تعرض شاشة «غير متاح» لأن مفاتيح التهيئة غير موجودة.

## العيوب مرتّبة بالأولوية

### P1 — 3 عيباً

| المسار | النافذة | الوصف | الدليل | لقطة | عدد التركيبات |
|---|---|---|---|---|---|
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 2.29:1 (المطلوب 4.5:1) — "Plato" 10px/700 rgba(69, 61, 49, 0.45) على rgb(244, 239, 228) | ![contrast:span.display-latin.text-[10px]:2.29](docs/audit-smoke/screenshots/_wisdom__mobile-360__light__ar.png) | 24 |
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 2.29:1 (المطلوب 4.5:1) — "صاحب الكهف · 427–347 BC" 11.2px/400 rgba(69, 61, 49, 0.45) على rgb(244, 239, 228) | ![contrast:span.mt-1.5.text-[0.7rem]:2.29](docs/audit-smoke/screenshots/_wisdom__mobile-360__light__ar.png) | 24 |
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 2.29:1 (المطلوب 4.5:1) — "ASK THE WISE" 12px/400 rgba(69, 61, 49, 0.45) على rgb(244, 239, 228) | ![contrast:p.display-latin.mt-1:2.29](docs/audit-smoke/screenshots/_wisdom__mobile-360__light__ar.png) | 6 |

### P2 — 6 عيباً

| المسار | النافذة | الوصف | الدليل | لقطة | عدد التركيبات |
|---|---|---|---|---|---|
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 3.27:1 (المطلوب 4.5:1) — "Plato" 10px/700 rgba(217, 208, 186, 0.45) على rgb(5, 5, 5) | ![contrast:span.display-latin.text-[10px]:3.27](docs/audit-smoke/screenshots/_wisdom__mobile-360__dark__ar.png) | 24 |
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 3.27:1 (المطلوب 4.5:1) — "صاحب الكهف · 427–347 BC" 11.2px/400 rgba(217, 208, 186, 0.45) على rgb(5, 5, 5) | ![contrast:span.mt-1.5.text-[0.7rem]:3.27](docs/audit-smoke/screenshots/_wisdom__mobile-360__dark__ar.png) | 24 |
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 4.12:1 (المطلوب 4.5:1) — "◈" 18px/400 rgba(69, 61, 49, 0.7) على rgb(244, 239, 228) | ![contrast:span.mt-0.5.size-11:4.12](docs/audit-smoke/screenshots/_wisdom__mobile-360__light__ar.png) | 18 |
| `/wisdom` | mobile-360 | مخالفة axe: Elements must meet minimum color contrast ratio thresholds | color-contrast (serious) على 9 عنصر — .tracking-\[0\.25em\] — "ASK THE WISE" Fix any of the following: Element has insufficient color contrast of 3.25 (foreground color: #646056, background color: #050505, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1 · .border-gold\/55 > .min-w-0.flex-1 > .flex-wrap.items-baseline.gap-x-2 > .tracking-widest.display-latin.text-\[10px\] — "Plato" Fix any of the following: Element has insufficient color contrast of 3.34 (foreground color: #6e6859, background color: #161309, font size: 7.5pt (10px), font weight: bold). Expected contrast ratio of 4.5:1 · .border-gold\/55 > .min-w-0.flex-1 > .mt-1\.5.text-\[0\.7rem\].block — "صاحب الكهف · 427–347 BC" Fix any of the following: Element has insufficient color contrast of 3.34 (foreground color: #6e6859, background color: #161309, font size: 8.4pt (11.2px), font weight: normal). Expected contrast ratio of 4.5:1 | ![axe:color-contrast](docs/audit-smoke/screenshots/_wisdom__mobile-360__dark__ar.png) | 12 |
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 4.12:1 (المطلوب 4.5:1) — "المدخل" 10px/400 rgba(69, 61, 49, 0.7) على rgb(244, 239, 228) | ![contrast:span.text-[10px].leading-tight:4.12](docs/audit-smoke/screenshots/_wisdom__mobile-360__light__ar.png) | 8 |
| `/wisdom` | mobile-360 | تباين نص غير كافٍ | 3.27:1 (المطلوب 4.5:1) — "ASK THE WISE" 12px/400 rgba(217, 208, 186, 0.45) على rgb(5, 5, 5) | ![contrast:p.display-latin.mt-1:3.27](docs/audit-smoke/screenshots/_wisdom__mobile-360__dark__ar.png) | 6 |

## الأداء لكل تركيبة

| المسار | النافذة | الثيم | اللغة | CLS | LCP (ms) | عنصر LCP |
|---|---|---|---|---|---|---|
| `/wisdom` | mobile-360 | dark | ar | 0.0000 | 660 | p.display-arabic.mt-4 |
| `/wisdom` | mobile-360 | dark | en | 0.0004 | 496 | p.display-arabic.mt-4 |
| `/wisdom` | mobile-360 | light | ar | 0.0000 | 492 | p.display-arabic.mt-4 |
| `/wisdom` | mobile-360 | light | en | 0.0000 | 440 | p.display-arabic.mt-4 |
| `/wisdom` | tablet-768 | dark | ar | 0.0311 | 480 | p.display-arabic.mt-4 |
| `/wisdom` | tablet-768 | dark | en | 0.0307 | 464 | p.display-arabic.mt-4 |
| `/wisdom` | tablet-768 | light | ar | 0.0310 | 484 | p.display-arabic.mt-4 |
| `/wisdom` | tablet-768 | light | en | 0.0311 | 548 | p.display-arabic.mt-4 |
| `/wisdom` | desktop-1440 | dark | ar | 0.0098 | 468 | p.display-arabic.mt-4 |
| `/wisdom` | desktop-1440 | dark | en | 0.0133 | 464 | p.display-arabic.mt-4 |
| `/wisdom` | desktop-1440 | light | ar | 0.0133 | 480 | p.display-arabic.mt-4 |
| `/wisdom` | desktop-1440 | light | en | 0.0101 | 508 | p.display-arabic.mt-4 |

## مخالفات axe بالتفصيل

| القاعدة | الأثر | عدد العناصر | المسارات |
|---|---|---|---|
| `color-contrast` | serious | 13 | `/wisdom` |

<details><summary>العناصر المخالفة كما يسمّيها axe</summary>

**`color-contrast`**

- .tracking-\[0\.25em\] — "ASK THE WISE" Fix any of the following: Element has insufficient color contrast of 3.25 (foreground color: #646056, background color: #050505, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
- .border-gold\/55 > .min-w-0.flex-1 > .flex-wrap.items-baseline.gap-x-2 > .tracking-widest.display-latin.text-\[10px\] — "Plato" Fix any of the following: Element has insufficient color contrast of 3.34 (foreground color: #6e6859, background color: #161309, font size: 7.5pt (10px), font weight: bold). Expected contrast ratio of 4.5:1
- .border-gold\/55 > .min-w-0.flex-1 > .mt-1\.5.text-\[0\.7rem\].block — "صاحب الكهف · 427–347 BC" Fix any of the following: Element has insufficient color contrast of 3.34 (foreground color: #6e6859, background color: #161309, font size: 8.4pt (11.2px), font weight: normal). Expected contrast ratio of 4.5:1
- a[data-audit-focus="1"] > .leading-tight.text-\[10px\] — "المدخل" Fix any of the following: Element has insufficient color contrast of 4.34 (foreground color: #7c766c, background color: #fdfbf4, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1

</details>

## كيف أُعيد الفحص

```bash
npm run build && npx next start -p 3000      # في نافذة طرفية أخرى
npm run audit:ui                            # الفحص الكامل
npm run audit:ui -- --only=/wisdom          # مسار واحد
npm run audit:ui -- --no-interact            # بدون النقر
npm run test:e2e -- audit-regression         # بوابة قبل الإطلاق
AUDIT_BASE_URL=https://…pages.dev npm run audit:ui   # على نشر حقيقي
```

اللقطات في `docs/audit/screenshots/`، والدليل الخام في `docs/audit/raw.json` (كل زيارة، كل مقياس، كل رابط). التقرير نفسه مكتوب آلياً من `scripts/audit/crawl.ts`؛ أي تعليق يدوي على العيوب المصحّحة يوضع في نهاية الملف تحت «الإصلاحات».
