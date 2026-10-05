# VISUAL_AUDIT — تصميم كما يراه المستخدم

Method: 72 real-browser captures (12 routes × 360×800 / 768×1024 / 1440×900 ×
dark + light) against a **production build** (`next start`), hydrated, full-page.
All 72 returned HTTP 200 with **zero console errors** and **zero failed requests**.
Horizontal overflow measured per combo (`scrollWidth ≤ innerWidth`): zero cases.
`dir=rtl` on all 72. Raw data: `visual-raw.json` (status, console, overflow, type
samples, top-150 inventory, axe). Screenshots: `{route}-{viewport}-{theme}.png`
(`/` = `root-…`).

Mid-pass correction: the first capture ran against `next dev`, where the CSP
nonce policy blocks Next's own HMR chunks — every page rendered SSR-only
(landing hero invisible, no mounted nav). Those shots were discarded and the full
pass re-ran against production. Lesson recorded, not hidden: any future visual
pass must target `next start`, never `next dev`.

## Verdicts by criterion (PASS routes omitted)

| route | viewport | theme | criterion | screenshot | impact |
|---|---|---|---|---|---|
| /journal | 360×800, 768×1024, 1440×900 | dark, light | [VH] | journal-1440x900-dark.png | ~10 same-weight sections stack with no dominant element; the reader scrolls a form marathon with no visual anchor. |
| /journal | 360×800, 768×1024, 1440×900 | dark, light | [TY] | journal-360x800-dark.png | Body copy measured 11.2–12px / 1.63 leading (criterion: ≥18px, 1.7); long-form journaling text at caption size. |
| /journal | 360×800, 768×1024, 1440×900 | light | [CO] | journal-1440x900-light.png | Prompt textareas keep the dark inset slab (`Journal.tsx:119` `panel-inset`) on Parchment; placeholder `text-ink-3` on charcoal is dim. |
| /tracker | 360×800, 768×1024, 1440×900 | dark, light | [ST] | tracker-1440x900-dark.png | Chart/stats zone renders as near-empty black panels with no loading shimmer and no zero-entries copy; a new user sees a void, not guidance. |
| /tracker | 360×800 | light | [CT] | tracker-360x800-light.png | Bottom-bar labels 4.34:1 (`Shell.tsx:376` 10px labels, need 4.5:1). |
| /wisdom | 360×800, 768×1024, 1440×900 | dark, light | [TY] | wisdom-360x800-dark.png | Body/lede measured from 12px (criterion ≥18px). |
| /wisdom | 360×800, 768×1024, 1440×900 | light | [CT] | wisdom-1440x900-light.png | Unselected persona cards 1.47:1 (`PersonaCards.tsx:59` dark slab + `:66,81` dim text on Parchment). |
| /wisdom | all | light | [CO] | wisdom-1440x900-light.png | Same slabs: unselected cards are the only dark-mode-styled components on the Parchment page. |
| /dialogue | all | dark, light | [TY] | dialogue-360x800-dark.png | Body from 12px (criterion ≥18px). |
| /quotes | all | dark, light | [TY] | quotes-360x800-dark.png | Body/meta from 11.2px (criterion ≥18px). |
| /quotes | all | light | [CT] | quotes-1440x900-light.png | Search input 2.84:1 (`#quote-search`); filter chips 3.22:1; quote source lines 3.31:1 (`text-gold-muted/60`). |
| /quotes | 360×800 | light | [CT] | quotes-360x800-light.png | Bottom-bar labels 4.37:1 (same `Shell.tsx:376` cause as /tracker). |
| /enter | all | dark, light | [TY] | enter-360x800-dark.png | Helper/guest-note copy from 12px (criterion ≥18px). |
| /enter | 360×800 | light | [CT] | enter-360x800-light.png | Bottom-bar labels 4.34:1 (same cause). |
| /pricing | all | dark, light | [TY] | pricing-1440x900-dark.png | Feature-list copy from 12px (criterion ≥18px). |
| /pricing | all | light | [CT] | pricing-1440x900-light.png | Tier feature lists 3.31:1; price/lede 4.13:1 (`PricingGrid`, `text-gold-muted/70`). |
| /pricing | 360×800 | light | [CT] | pricing-360x800-light.png | Bottom-bar labels 4.37:1 (same cause). |
| /paths | all | dark, light | [TY] | paths-360x800-dark.png | Body from 14px (criterion ≥18px). |
| /paths | all | light | [CT] | paths-1440x900-light.png | Oracle/sanctum tier links 4.29:1; section kickers 4.13:1. |
| /account | all | dark, light | [TY] | account-360x800-dark.png | Body from 12px (criterion ≥18px). |
| /account | all | light | [CT] | account-1440x900-light.png | Password/email inputs 3.57:1 (`#cur-pw`, `#new-pw`, `#new-email`, `#cur-pw-email`); theme/locale switchers 4.29:1; Latin labels 4.13:1. |
| / | all | dark, light | [TY] | root-360x800-dark.png | Lede/definition copy from 11px (criterion ≥18px). Headings comply (700, 24–48px scale). |
| / | 360×800, 768×1024, 1440×900 | dark, light | [AN] | root-1440x900-dark.png | Hero intro runs 0.7–1.2s with delays to 1.4s (`UtopiaHero.tsx:72-154`); first paint carries no content. Purposeful but over the 400ms budget. |
| /pricing | all | dark, light | [AN] | pricing-1440x900-dark.png | Tier cards 0.55s + banner 0.5s (`Membership.tsx:45`, `MembershipBanner.tsx:132`). |
| /tracker | all | dark, light | [AN] | tracker-1440x900-dark.png | Chart bars 0.7s (`DailyTracker.tsx:204`). |
| global chrome | 1440×900 | dark, light | [AN] | wisdom-1440x900-dark.png | Rail expand 0.45s (`Sidebar.tsx:146`); token fade 700ms (`GoldenToken.tsx:107`); symbols 500–700ms (`GoldenSymbols.tsx:162,195`). `globals.css:309` reduced-motion guard exists and must cover each of these. |

Explicit PASSes worth recording: [SG] everywhere (3 arbitrary px values in all
of `src/components`, all fixed chrome dims — no `pt-[13px]` pattern); [AU]
everywhere (gold = active nav + one CTA + hairline accents; oracle/sanctum are
art-heavy but gold-restrained); [MW] all 72 measured zero-overflow; [RT]
`dir=rtl` all 72, icons symmetric, no unflipped directional glyphs observed;
[CT] dark theme clean on all 12 routes (every contrast FAIL is light-only);
axe `page-has-heading-one` resolved under hydration (h1 present on all routes);
zero console errors on production (the dev-mode CSP block does not occur).

[ST] coverage limit (not a FAIL): idle states are complete everywhere observed;
loading/error/quota/gate paths need interaction to exercise and were not clicked
in this pass — except /tracker above, where the void is visible at rest.

## TOP-150px inventory (critical check)

Legend: `nav/logo (keep)` · `skip-link (hidden, keep)` · page headings (content, keep).

| route | 1440×900 items | 360×800 items |
|---|---|---|
| / | none (hero starts ~y200) | none |
| /wisdom | rail nav (aria "التنقل الرئيسي", `Shell.tsx`) + logo link (aria "عقل في صندوق — الصفحة الرئيسية", `Logo.tsx` via `Shell.tsx:180`) + h1 "اسأل الحكيم" (`WisdomChat.tsx:442`) + "ASK THE WISE" (`:444`) + lede | h1 + kicker + lede (no top chrome on mobile — bottom bar instead) |
| /dialogue | rail + logo + h1 "الحوار" + "DIALOGUE" + lede | h1 + kicker + lede |
| /journal | rail + logo + h1 "المفكرة" + "JOURNAL" + h2 "هل يقرأ الذكاء مفكّرتك؟" + reassurance line | h1 + kicker + h2 + reassurance |
| /tracker | rail + logo + h1 "متتبع الوعي" + guidance line | h1 + guidance |
| /paths | rail + logo + h1 "المسارات" + "Paths" + lede | h1 + kicker + lede |
| /quotes | rail + logo + h1 "الاقتباسات" + "QUOTES" + lede | h1 + kicker + lede |
| /enter | rail + logo + h1 "تسجيل الدخول" | h1 only |
| /pricing | rail + logo + h1 "العضويات" + "Membership" + lede | h1 + kicker + lede |
| /oracle | rail + logo only (art-first, content below 150px) | none |
| /sanctum | rail + logo only (art-first, content below 150px) | none |
| /account | rail + logo + h1 "الحساب" + "Account" | h1 + kicker + identity section (aria "بيانات الحساب") |

Findings: **zero** scroll indicators, chevrons/arrows, "SCROLL" text, debug text,
or decorative surplus in the top 150px of any route — nothing to remove. The
"SCROLL" indicator exists only at the landing hero's foot (~y840, hero-scoped,
not fixed). Skip-link verified in source (`layout.tsx:139`, `sr-only`,
visible-on-focus per `globals.css:611-624`) and correctly invisible in all 72
shots — keep as is. Note: a stricter "logo+nav ONLY in top 150px" rule would
flag every page h1; that rule was not part of this task's classification set,
which keeps page headings as content.

## Observations beyond the 10 criteria (no FAIL)

- Western numerals inside Arabic UI (`2026-10-04`, counts, `CSV/JSON` buttons):
  consistent and deliberate-looking; flagged only so the numerals decision stays
  conscious.
- `Â·` mojibake visible on wisdom persona cards (`PersonaCards.tsx:86`) and
  `…`/`—` byte-patterns elsewhere — already in `AUDIT.md` §D, confirmed
  on-screen here.
- The fixed MembershipBanner ("A NOTE ON MEMBERSHIP", dismissible) floats over
  content bottom-right on free-tier pages — intended component, correctly
  dismissible, not a defect.
