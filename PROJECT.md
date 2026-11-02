# Project: mindinbox-final — The Living Sanctuary

## Architecture
- **Framework & Runtime**: Next.js 14.2.35 on Cloudflare Pages using `@cloudflare/next-on-pages` (v1.13.16) and Edge Runtime (`export const runtime = 'edge'`).
- **Design Philosophy**: "The Living Sanctuary" — Apple-grade luxury digital craftsmanship balancing contemplative stillness with advanced interactive engineering. Dual aesthetic: **Luminous Obsidian** (Dark mode `#06070B`) and **Modern Parchment** (Light mode `#f4efe4`).
- **Typography Engine**:
  - `IBM Plex Sans Arabic`: Clean, readable primary UI typography.
  - `Amiri`: Classical Arabic display typography for titles, philosophical aphorisms, and sacred quotes.
  - `Cinzel`: Classical Latin display typography.
  - Relaxed line-heights (`--leading-relaxed: 1.85`) and fluid clamp scales (`--text-xs` through `--text-4xl`).
- **Material & Lighting System**:
  - Multi-tier frosted glassmorphism: `surface-glass-subtle` and `surface-glass-elevated`.
  - Specular hairline highlights (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08)`).
  - Light-source responsive hairline borders (`border-hairline`, `border-specular`).
- **Authentic Cinematic Asset Pipeline**:
  - Pure WebP and AVIF formats with responsive srcset variants (640w, 768w, 1280w, 1920w).
  - Strict prohibition of dummy geometric cubes (`SpatialBox.tsx`), procedural CSS colonnades (`GreekColumns.tsx`), and flat SVG vector shapes (`stoa-night/day.svg`).
  - Next.js Edge-compatible `<picture>` responsive delivery with graceful focal alignment and scrim lighting gradients.
- **Client & State Architecture**:
  - App Shell: `ShellChrome`, `Header` (Desktop & Mobile), `MobileBottomBar` (5-slot grid, safe areas), `Footer`.
  - State stores: Zustand (`mindinbox-store` v2 with localStorage sync), React Contexts (`ThemeContext`, `LocaleContext`, `AuthContext`).
- **Functional Integrity & Edge Security**:
  - 100% preservation of all 14 API routes in `src/app/api/`.
  - Firebase Auth via Edge-compatible `jose` RS256 JWT verification (`requireUser`, `requireAdmin`, `requireRecentAuthentication`).
  - Subscription entitlement engine (`getEntitlements`, Firestore billing state, trial period).
  - Streaming AI Engine: Server-Sent Events (SSE) with robust `AbortSignal` cancellation and zero unhandled rejections.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Luxury Design Token Engine | Calibrate frosted glassmorphism, specular hairline highlights, and solid contrast tokens (`text-ink-1`, `text-ink-2`, `text-ink-3`) across `globals.css`, `studio.css`, and `tailwind.config.ts` | M1 | survey_ui, survey_qa |
| 2 | Typography & RTL Parity | Refine Amiri and IBM Plex Sans Arabic fluid clamp typography; fix `Footer.tsx` hardcoded Arabic labels in English mode | M1 | survey_ui |
| 3 | Eliminate Procedural Wireframes | Replace `SpatialBox.tsx` (CSS wireframe cube), `GreekColumns.tsx` (CSS gradient colonnade), and `.stoa-art` (SVG wireframes) with authentic cinematic imagery | M1 | survey_assets |
| 4 | Route Atmospheric Asset Production | Produce authentic responsive WebP/AVIF imagery for `/quotes`, `/pricing`, `/account`, and dedicated `/sanctum` vs `/oracle` | M1 | survey_assets |
| 5 | Canonical Philosopher Portrait Gallery | Expand persona portraits from 4 to 17 canonical thinkers (Socrates, Nietzsche, Marcus Aurelius, Ibn Rushd, Al-Ghazali, Aristotle, Avicenna, Spinoza, etc.) in WebP/AVIF | M1 | survey_assets |
| 6 | Asset Pipeline & Manifest Repair | Repair `art-manifest.json`, integrate responsive `<picture>` helpers, and fix missing build assets (`scripts/make-og.mjs`) | M1 | survey_assets |
| 7 | Apple-Grade App Shell Redesign | Refine `Header.tsx`, `MobileBottomBar`, `ShellChrome.tsx`, and `Footer.tsx` with frosted glass, 44×44px touch targets, and silk spring transitions | M2 | survey_ui, survey_qa |
| 8 | UtopiaHero & Editorial Narrative Overhaul | Overhaul Home page: Hero with philosopher lenses, 3 Practices, Reading Table, Argument Lab, and Film Screenings with luxury micro-interactions | M2 | survey_ui |
| 9 | Wisdom Chat Sanctuary (`/wisdom`) | Redesign `/wisdom` with Apple Books/Mindfulness elegance, preserving streaming, bubbles, `#wisdom-input`, quota meter, and response actions | M3 | survey_ui, survey_qa |
| 10 | Dialogue Amphitheater (`/dialogue`) | Redesign `/dialogue` 2-philosopher debate arena, preserving debate engine, 3 alternating rounds, reader interjection, and synthesis | M3 | survey_ui, survey_qa |
| 11 | Reflective Journal Sanctuary (`/journal`) | Redesign `/journal` with luxury Moleskine aesthetic, preserving local-first + Firestore sync, categories, note drawer, and AI consent toggle | M3 | survey_ui, survey_qa |
| 12 | Growth & Habit Tracker (`/tracker`) | Redesign `/tracker` interactive dials, Framer Motion 7-day gold chart, streaks, and habit logging | M3 | survey_ui, survey_qa |
| 13 | Verified Quotes Sanctuary (`/quotes`) | Redesign `/quotes` with atmospheric backdrop, multi-template card generator (gold-black, parchment, minimal), and watermark gate | M3 | survey_ui, survey_qa |
| 14 | Pathways & Journey Map (`/paths`) | Redesign `/paths` learning journey maps, interactive milestone nodes, and deep links to Oracle & Sanctum | M3 | survey_ui, survey_qa |
| 15 | Transparent Pricing Sanctuary (`/pricing`) | Redesign `/pricing` transparent 3-column membership cards, distinct tier insignia, and honest pricing presentation | M4 | survey_ui, survey_qa |
| 16 | The Oracle Manuscript Sanctuary (`/oracle`) | Redesign `/oracle` exclusive manuscript library, daily philosopher analysis, and PDF downloads | M4 | survey_ui, survey_qa |
| 17 | The Sanctum Chamber (`/sanctum`) | Redesign `/sanctum` bespoke luxury chamber ($100/mo), vintage gold-framed video player, and private Sanctum Circle board | M4 | survey_ui, survey_qa |
| 18 | Sanctuary Gates Authentication (`/enter`) | Redesign `/enter` luxury authentication panel, 4 auth modes, Turnstile bot protection, and guest account linking | M4 | survey_ui, survey_qa |
| 19 | Account & Data Portability (`/account`) | Redesign `/account` user profile, subscription status, bilingual preferences, JSON export, and secure deletion | M4 | survey_ui, survey_qa |
| 20 | Automated E2E & Quality Baseline Hardening | Execute full Playwright E2E test suite, Vitest suite (430+ tests), build/lint/typecheck, WCAG 2.2 AA contrast/touch target verification | M5 | survey_qa |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Design Tokens, Typography, Materials & Cinematic Assets | F1, F2, F3, F4, F5, F6: tokens, typography, asset generation, wireframe elimination, manifest | none | DONE |
| M2 | App Shell & Editorial Home Experience | F7, F8: Header, MobileBottomBar, ShellChrome, Footer, UtopiaHero, micro-interactions | M1 | IN_PROGRESS |
| M3 | Core Intelligence & Reflection Pages | F9, F10, F11, F12, F13, F14: `/wisdom`, `/dialogue`, `/journal`, `/tracker`, `/quotes`, `/paths` | M1, M2 | PLANNED |
| M4 | Gateways, Commerce & Sanctuary Pages | F15, F16, F17, F18, F19: `/pricing`, `/oracle`, `/sanctum`, `/enter`, `/account` | M1, M2 | PLANNED |
| M5 | Quality Hardening, E2E Verification & Build Compliance | F20: Playwright E2E suites, WCAG 2.2 AA audit, Next.js Edge build, 100% pass | M3, M4 | PLANNED |

---

## Interface Contracts

### Design Tokens & Materials (`src/app/globals.css` & `src/app/studio.css`)
- **Theme Variables**:
  - Obsidian (Dark): `--bg-0: #06070B`, `--bg-1: #0D1017`, `--bg-2: #141824`, `--surface-1: rgba(255,255,255,0.04)`, `--surface-2: rgba(255,255,255,0.07)`, `--gold: 212 175 55`.
  - Parchment (Light): `--bg-0: #f4efe4`, `--bg-1: #ece5d6`, `--bg-2: #e3dac7`, `--surface-1: rgba(255,253,247,0.62)`, `--surface-2: rgba(255,253,247,0.86)`, `--gold: 111 86 17`.
  - Specular Hairline: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08)`.
  - Hairline Border: `border-color: rgba(var(--gold), 0.15)` dark, `rgba(var(--gold), 0.22)` light.

### Asset Manifest & Picture Delivery Contract (`src/components/art/ArtLayer.tsx`)
- All visual artworks delivered via `<picture>` elements with:
  - `<source type="image/avif" srcSet="...">`
  - `<source type="image/webp" srcSet="...">`
  - `<img loading="lazy" decoding="async" ... />` (or `loading="eager"` / `fetchPriority="high"` for hero/header backgrounds).
  - Explicit aspect ratios and dimensions to guarantee **Zero CLS** (< 0.01).

### DOM Selector Contracts for Playwright E2E Tests
- `document.documentElement.dataset.hydrated === "1"` must be set upon client mount in `AppShell.tsx`.
- Single `<main id="main">` landmark in `ShellChrome.tsx`.
- `/wisdom`: `[data-streaming]`, `[data-bubbles]`, `#wisdom-input`, `button:has-text("أرسل")`, `[role="radiogroup"][aria-label="اختر فيلسوفك"]`.
- `/dialogue`: `h1:has-text("الحوار")`, `textarea[aria-label="سؤالك"]`, `p:has-text("⇄")`, `article h2`.
- `/quotes`: `li[data-quote-id]`, `button:has-text("ذهبي-أسود")`, `button:has-text("ورقي")`, `button:has-text("أضف للمفضّلة")`.
- Mobile touch targets: All interactive elements must satisfy `min-h-[44px] min-w-[44px]`.

---

## Code Layout
- `src/app/globals.css`: Master design tokens, CSS variables, typography clamp scales, glassmorphism utilities.
- `src/app/studio.css`: Editorial layout styles, narrative sections, micro-interaction physics.
- `tailwind.config.ts`: Tailwind configuration bound to dynamic theme RGB triplets.
- `public/art/`: Optimized responsive WebP and AVIF background artworks and textures.
- `public/images/philosophers/`: Canonical philosopher portrait gallery (17 thinkers in responsive WebP/AVIF).
- `src/components/ShellChrome.tsx`, `Header.tsx`, `Footer.tsx`: App Shell navigation and frame.
- `src/components/UtopiaHero.tsx`: Editorial narrative Home page experience.
- `src/components/WisdomChat.tsx`: `/wisdom` AI single-persona dialogue.
- `src/components/Dialogue.tsx`: `/dialogue` 2-philosopher debate arena.
- `src/components/journal/`: `/journal` reflective notes and drawer.
- `src/components/DailyTracker.tsx`: `/tracker` habit/mood tracking and gold chart.
- `src/components/quotes/`: `/quotes` aphorism sanctuary and card generator.
- `src/app/paths/`: `/paths` philosophical journey map.
- `src/components/PricingGrid.tsx`: `/pricing` honest pricing tiers.
- `src/components/MemberLibrary.tsx`: `/oracle` & `/sanctum` member sanctuary experiences.
- `src/components/AuthPanel.tsx`: `/enter` sanctuary gates authentication.
- `src/components/AccountPanel.tsx`: `/account` user profile, data portability & preferences.
- `e2e/`: Playwright end-to-end verification suites.
- `tests/`: Vitest unit and stress test suites.
