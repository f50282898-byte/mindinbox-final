# Test Infrastructure & Methodology (`TEST_INFRA.md`)
## 4-Tier Opaque-Box Testing Infrastructure for "The Living Sanctuary"

### 1. Architectural Overview & Design Philosophy
The testing infrastructure for **Mind in a Box ("The Living Sanctuary")** implements a dual-layer, 4-tier verification architecture:
1. **End-to-End Client & Experience Verification Layer (`e2e/living-sanctuary.spec.ts`)**: Built with Playwright (v1.64.0) to validate the end-to-end user experience, DOM landmark contracts, luxury interaction mechanics, mobile/desktop responsive boundaries, bilingual RTL typography, theme persistence, and sanctuary workflows across real headless browser engines (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari).
2. **Backend & AI Engine Web Contract Verification Layer (`tests/e2e-ai-verification.test.ts`)**: Built with Vitest (v2.1.9) on Edge Web Standards (`Request`, `Response`, `ReadableStream`, `TextDecoder`) to validate the core AI HTTP route handlers (`/api/ai` and `/api/dialogue`), SSE framing, quota limits, failover chains, wellbeing safety guards, and rate limiting.

Both layers operate strictly under **opaque-box principles**, driving the application through public observable surfaces (HTTP requests, DOM landmarks, user gestures, and storage changes) without coupling to internal private states.

---

### 2. Dual-Layer 4-Tier Architecture Diagram

```
+=========================================================================================================+
| TIER 4: REAL-WORLD WORKFLOWS & END-TO-END PILGRIM JOURNEYS                                              |
| - Pilgrim Full Journey: Home (Reading Table) -> Wisdom (Chat) -> Quotes -> Pricing -> Account          |
| - Gateway Exploration Flow: Visitor -> Guest Authentication Link -> Journal / Dialogue                  |
| - Arabic Philosophical Dialogue Synthesis: Plato & Rumi sequential inquiry                              |
| - Crisis Intervention Safety Guard: Immediate bypass & helpline broadcast (zero quota debit)           |
+=========================================================================================================+
                                                   ▲
+=========================================================================================================+
| TIER 3: CROSS-FEATURE INTERACTIONS & RESILIENCE                                                         |
| - Cross-Route Navigation State & Theme Retention: / -> /wisdom -> /journal -> /tracker -> /quotes       |
| - AI Dialogue Turn Sequence & Guest Quota Preservation: Turn framing + preview_end cap                 |
| - Home Lens Deep-Linking: Query parameter (?philosopher=...&q=...) preservation into /wisdom           |
| - Quotes Customization & Favorites Persistence: Template switching ("ورقي") & bookmark state           |
| - Provider Failover Resilience & Stream Drop Handling: Primary adapter -> Secondary adapter failover    |
+=========================================================================================================+
                                                   ▲
+=========================================================================================================+
| TIER 2: BOUNDARY & CORNER CASES                                                                         |
| - Mobile Viewport Boundaries: 390px (iPhone 14) & 430px (iPhone Pro Max) zero horizontal overflow      |
| - Ultra-Wide Desktop Boundaries: 1440px & 1920px structural layout bounds & typography readability     |
| - Theme Switching & Persistence: Luminous Obsidian (Dark) vs Modern Parchment (Light) via localStorage |
| - RTL Layout Direction & Arabic Typography: html[dir="rtl"], html[lang="ar"], Amiri & IBM Plex Arabic  |
| - Accessibility Shortcuts & Visible Focus: Ctrl+Shift+L, Ctrl+Shift+T, and visible focus indicator     |
| - Edge API Robustness: Empty prompts (400), persona validation, quota gate (402), burst limits (429)   |
+=========================================================================================================+
                                                   ▲
+=========================================================================================================+
| TIER 1: FEATURE COVERAGE (>=5 Test Cases Per Primary Feature Area)                                     |
| [Area 1: App Shell Architecture]                                                                       |
|   * T1.1.1: Single <main id="main"> landmark across routes                                             |
|   * T1.1.2: Client hydration handshake data-hydrated="1" contract                                      |
|   * T1.1.3: Skip-link keyboard bypass as first tab target                                               |
|   * T1.1.4: Desktop header landmarks & primary practice links                                           |
|   * T1.1.5: Appearance controls accessible labels & toggle buttons                                      |
|   * T1.1.6: Mobile bottom bar 5-slot grid & >=44px touch targets                                       |
| [Area 2: Editorial Home Page & UtopiaHero]                                                             |
|   * T1.2.1: UtopiaHero masthead, brand logo ("A SPACE TO THINK"), and display H1                       |
|   * T1.2.2: Philosopher lenses interactive selection updating portal picture & polite caption           |
|   * T1.2.3: 3 Practices editorial cards rendering numbered links (01, 02, 03)                          |
|   * T1.2.4: Reading Table exercise in choosing populating hero question textarea                       |
|   * T1.2.5: Argument Lab (ArgumentGame) 3-round interactive logic and status feedback                   |
|   * T1.2.6: Portrait screening video gallery with posters, controls, and captions                       |
| [Area 3: All 11 Primary Pages Coverage]                                                                |
|   * T1.3.1: Core intelligence landmarks: /wisdom, /dialogue, /journal, /tracker                        |
|   * T1.3.2: Contemplation & guidance landmarks: /quotes, /paths                                        |
|   * T1.3.3: Commerce & member chamber landmarks: /pricing, /oracle, /sanctum                           |
|   * T1.3.4: Gateway & identity landmarks: /enter, /account                                             |
|   * T1.3.5: Zero broken images audit across all 11 primary pages and landing page                       |
+=========================================================================================================+
```

---

### 3. Detailed Test Matrix: "The Living Sanctuary" E2E Suite (`e2e/living-sanctuary.spec.ts`)

| Tier | Test ID | Description | Target Surface | Verification Standard / Contract |
|---|---|---|---|---|
| **Tier 1: Feature Coverage** | `T1.1.1` | Single `<main id="main">` landmark integrity | Shell (`/`, `/wisdom`, `/pricing`, `/paths`) | WCAG 2.2 Landmark rule, PROJECT.md § ShellChrome |
| | `T1.1.2` | Client hydration handshake `data-hydrated="1"` | Shell (`AppShell.tsx`) | DOM Selector Contract: `document.documentElement.dataset.hydrated === "1"` |
| | `T1.1.3` | Skip-link bypass keyboard accessibility | Layout (`a.skip-link[href="#main"]`) | WCAG 2.2 SC 2.4.1 Bypass Blocks |
| | `T1.1.4` | Desktop header navigation and primary links | Header (`DesktopHeader.tsx`) | 4 core practices (`/wisdom`, `/dialogue`, `/journal`, `/tracker`) |
| | `T1.1.5` | Appearance controls accessible buttons | Header (`AppearanceControls.tsx`) | `aria-label` for locale and theme switches |
| | `T1.1.6` | Mobile bottom bar 5-slot grid & target sizing | Mobile Shell (`MobileBottomBar.tsx`) | Exactly 5 items, touch targets >= 44x40px |
| | `T1.2.1` | UtopiaHero masthead, brand logo and display H1 | Home (`/`, `UtopiaHero.tsx`) | `h1#home-heading` with `aria-label="عقل في صندوق"` |
| | `T1.2.2` | Philosopher lenses selection and portal updates | Home (`.home-lenses`, `.home-portal`) | Interactive lens toggle, `<picture>` responsive artwork, live caption |
| | `T1.2.3` | Three practices editorial cards (01, 02, 03) | Home (`.home-practices`) | Links to `/wisdom`, `/dialogue`, `/journal` |
| | `T1.2.4` | Reading Table exercise in choosing | Home (`.reading-table`) | 3 exercise cards, populate `#hero-q` textarea and transfer focus |
| | `T1.2.5` | Argument Lab (`ArgumentGame`) 3-round logic | Home (`.argument-game`) | Interactive claims, choices, status reasoning, and progression |
| | `T1.2.6` | Portrait screening video gallery | Home (`.portrait-screening`) | `<details>`, `<summary>`, WebM `<video>` elements, poster artworks |
| | `T1.3.1` | Core intelligence pages landmarks | `/wisdom`, `/dialogue`, `/journal`, `/tracker` | `#main`, `#wisdom-input`, radiogroup, editor, tracker dials |
| | `T1.3.2` | Contemplation and paths pages landmarks | `/quotes`, `/paths` | `#main`, card generator templates, 3 pathway cards, deep links |
| | `T1.3.3` | Commerce and member chambers landmarks | `/pricing`, `/oracle`, `/sanctum` | `#main`, 3-tier membership grid, `MemberLibrary` access contracts |
| | `T1.3.4` | Gateway and account landmarks | `/enter`, `/account` | `#main`, guest entry, auth tabs, profile and export actions |
| | `T1.3.5` | Zero broken images audit across all pages | All 11 pages + `/` | `naturalWidth > 0`, complete loading, 0 404 image errors |
| **Tier 2: Boundary & Corner Cases** | `T2.1` | Mobile viewports (390px & 430px) overflow stress | Mobile viewports (all pages) | `scrollWidth <= clientWidth + 1px` |
| | `T2.2` | Ultra-wide desktop (1440px & 1920px) bounds | Desktop viewports (all pages) | Responsive container constraints (`max-w-*`), typography readability |
| | `T2.3` | Theme toggle & persistence (Obsidian vs Parchment) | `[data-theme="dark\|light"]` | `localStorage["mindinbox-theme"]`, persistence across reloads |
| | `T2.4` | RTL layout direction & Arabic typography parity | `html[dir="rtl"][lang="ar"]` | Font family stack (`Amiri`, `IBM Plex Sans Arabic`), RTL flex/grid |
| | `T2.5` | Keyboard shortcuts & visible focus indicators | Shell shortcuts (`Ctrl+Shift+L/T`) | Instant switch, visible outline/box-shadow on focused elements |
| **Tier 3: Cross-Feature Interactions** | `T3.1` | Cross-route navigation & theme retention | Nav chain: `/` -> `/wisdom` -> `/journal`... | Theme persists across routes; `aria-current="page"` updates |
| | `T3.2` | AI dialogue turn sequence & quota preservation | `/dialogue` & `POST /api/dialogue` | Sequential framing (`turn_start` -> `delta` -> `turn_end`), guest cap |
| | `T3.3` | Home lens query deep-linking into `/wisdom` | Home -> `/wisdom` | `?philosopher=...&q=...` pre-fills composer and persona |
| | `T3.4` | Quotes card template & favorite interaction | `/quotes` | "ورقي" Parchment style switch, "أضف للمفضّلة" state toggle |
| **Tier 4: Real-World Workflows** | `T4.1` | Comprehensive End-to-End Pilgrim Journey | Multi-page pilgrimage flow | Home -> Wisdom -> Quotes -> Pricing -> Account (0 unexpected errors) |
| | `T4.2` | Visitor to Member Gateway Exploration Flow | `/enter` -> App surfaces | Guest session initialization and seamless transition |

---

### 4. Detailed Test Matrix: Backend & AI Engine Suite (`tests/e2e-ai-verification.test.ts`)

| Tier | Test ID | Description | Target Surface | Requirement / Contract |
|---|---|---|---|---|
| **Tier 1: Feature Coverage** | `T1.1` | Single chat SSE generation (headers, quota, deltas, done usage) | `POST /api/ai` | PROJECT.md § Interface Contracts, R2 |
| | `T1.2` | Multi-turn conversational history with role normalization | `POST /api/ai` | R2, Feature 8 |
| | `T1.3` | Multi-speaker dialogue round orchestration (`turn_start/delta/end`) | `POST /api/dialogue` | PROJECT.md § Interface Contracts, R2 |
| | `T1.4` | Multi-byte UTF-8 Arabic text streaming integrity across chunk bounds | `POST /api/ai` | ORIGINAL_REQUEST.md, SSE Contract |
| **Tier 2: Boundary & Corner Cases** | `T2.1` | Rejection of empty/malformed prompts (HTTP 400 Bad Request) | `POST /api/ai` | Body Validation Contract |
| | `T2.2` | Dialogue parameter validation: short questions & duplicate personas | `POST /api/dialogue` | Dialogue Policy Contract |
| | `T2.3` | Graceful fallback to default persona (`plato`) on unknown `personaId` | `POST /api/ai` | Persona Fallback Contract |
| | `T2.4` | Strict persona registry rejection on unknown persona in dialogue | `POST /api/dialogue` | Dialogue Schema Contract |
| | `T2.5` | Quota exhaustion gate enforcement (HTTP 402 GATE) | `POST /api/ai` | Quota Contract (`FREE_INTERACTIONS = 5`) |
| | `T2.6` | Dialogue quota gate enforcement (HTTP 402 GATE) | `POST /api/dialogue` | Feature 9, Dialogue Quota |
| | `T2.7` | Burst rate-limiting gate (HTTP 429) when > 8 requests in burst window | `POST /api/ai` | `src/lib/quota.ts` (`BURST_MAX_REQUESTS = 8`) |
| | `T2.8` | Cross-origin CSRF guard rejection (HTTP 403 `cross_origin_forbidden`) | `POST /api/ai` | Same-origin security guard |
| **Tier 3: Cross-Feature & Failover** | `T3.1` | Automatic failover from failed primary adapter to secondary provider | `POST /api/ai` | Failover Chain Contract |
| | `T3.2` | Terminal error emission (`provider_unavailable`) when all providers fail | `POST /api/ai` | Circuit Breaker & Failover Chain |
| | `T3.3` | Immediate HTTP 503 `no_provider` when provider chain is empty | `POST /api/ai` | Provider Configuration Contract |
| | `T3.4` | Client cancellation propagation: aborts upstream fetch promptly | `src/lib/ai/chain.ts` | AbortSignal Handling Contract |
| | `T3.5` | Terminal error emission (`upstream_error`) on mid-stream connection drop | `POST /api/ai` | SSE Error Protocol |
| **Tier 4: Real-World Scenarios** | `T4.1` | Full philosophical Arabic inquiry between Plato and Rumi | `POST /api/dialogue` | ORIGINAL_REQUEST.md, R1, R2 |
| | `T4.2` | Wellbeing crisis guard intercepts despair phrases, quota uncharged | `POST /api/ai` | Safety & Wellbeing Contract |
| | `T4.3` | Configuration probe (`GET /api/ai`) exposes active providers & limits | `GET /api/ai` | Service Observability Probe |

---

### 5. Verification Commands & Execution Instructions

#### 1. Playwright E2E Living Sanctuary Suite
```bash
# List all 308 configured test executions
npx playwright test e2e/living-sanctuary.spec.ts --list

# Run Living Sanctuary suite on Chromium Desktop
npx playwright test e2e/living-sanctuary.spec.ts --project=chromium-desktop

# Run Living Sanctuary suite on Mobile Chrome (iPhone / Pixel viewports)
npx playwright test e2e/living-sanctuary.spec.ts --project=mobile-chrome
```

#### 2. Backend & AI Engine Verification Suite
```bash
npx vitest run --config vitest.rules.config.ts tests/e2e-ai-verification.test.ts
```

#### 3. Full Unit & System Regression Suites
```bash
# Full Vitest test suite (430 tests across 34 files)
npm test

# TypeScript type check (0 errors)
npm run typecheck

# Code style and Next.js lint check
npm run lint
```
