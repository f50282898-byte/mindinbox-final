# Graph Report - mindinbox-final  (2026-11-02)

## Corpus Check
- 285 files · ~258,469 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 58 file(s) not represented in the graph (top: .avif 47, (none) 4, .rules 2)

## Summary
- 2132 nodes · 4513 edges · 109 communities (103 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 114 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `42fce268`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- stress-contrast-tokens.test.ts
- crawl.ts
- dialogue/route.ts
- Markdown.tsx
- memory.ts
- package.json
- content.ts
- site/route.ts
- ArtLayer
- scripts
- QuotesApp.tsx
- signals/route.ts
- aggregate.ts
- firestore-rest.ts
- firestore-rest.ts
- chain.ts
- AdminConsole.tsx
- site-store.ts
- The golden token riddle
- streaks.ts
- AGENT-BRIEF.md
- site/route.ts
- tiers.ts
- 4. المراحل التسع
- mojibake.mjs
- next
- nav.ts
- MemberLibrary.tsx
- conversations.ts
- The UI audit harness
- site-schema.ts
- e2e-ai-verification.test.ts
- server.ts
- quota.ts
- WisdomChat.tsx
- guards.ts
- audit-regression.spec.ts
- package.json
- i18n.tsx
- verify-contrast.mjs
- ai-consent.ts
- assistant/route.ts
- compilerOptions
- AUDIT-UI — فحص الواجهة كما يراه المستخدم
- lensToken.ts
- PLAN — عقل في صندوق / Mind in a Box (fix slices)
- personas.ts
- DECISIONS
- signals.spec.ts
- chain.ts
- server.ts
- e2e-ai-verification.test.ts
- 4. المراحل التسع
- check-headers.mjs
- Header.tsx
- ai/route.ts
- dependencies
- lensToken.ts
- signals/types.ts
- conversations.ts
- PROJECT_MAP — عقل في صندوق / Mind in a Box
- vitest
- check-api.mjs
- ArtLayer.tsx
- site-schema.ts
- streaks.ts
- make-og.mjs
- generate-pwa.mjs
- app/page.tsx
- DailyTracker.tsx
- sanitize.ts
- AUDIT — عقل في صندوق / Mind in a Box (read-only)
- vitest
- prompt.ts
- site-config.ts
- check-content.mjs
- test-check-env.mjs
- turnstile.ts
- consent.ts
- signals/types.ts
- ملف عمل Gemini لمشروع عقل في صندوق
- Firebase Console — manual steps
- AUDIT-UI — فحص الواجهة كما يراه المستخدم
- check-worker.mjs
- riddle.spec.ts
- AmbientAudioToggle.tsx
- react
- guards.ts
- مقارنة مزوّدي الدفع — Paddle مقابل Lemon Squeezy
- WisdomChat
- H. Cloudflare environment variables
- signals/types.ts
- ملخص المشروع لإعادة تصميم الواجهة
- prompt.ts
- journal/types.ts
- shell.spec.ts
- 4-Tier Opaque-Box Testing Infrastructure for "The Living Sanctuary"
- Project: mindinbox-final
- Firebase Console — manual steps
- Prompt 06 + 09 surfaces — what this pass built
- Cloudflare Workers deployment
- Prompt 09 — quotes: what was verified, and what was refused
- Dialogue.tsx
- RELEASE-PLAN-AR.md
- Status: READY & VERIFIED (Dual-Layer 4-Tier Test Architecture)
- Prompt 08 — the journal
- WisdomChat.tsx

## God Nodes (most connected - your core abstractions)
1. `next` - 54 edges
2. `react` - 50 edges
3. `vitest` - 42 edges
4. `scripts` - 38 edges
5. `POST()` - 37 edges
6. `DECISIONS` - 36 edges
7. `POST()` - 31 edges
8. `WisdomChat()` - 30 edges
9. `The UI audit harness` - 30 edges
10. `useAppStore` - 29 edges

## Surprising Connections (you probably didn't know these)
- `D83 - `networkidle` is unreachable for a correctly configured app` --references--> `AppShell()`  [INFERRED]
  PROJECT_MAP.md → src/components/AppShell.tsx
- `D84 - An unread response body holds the connection open forever` --references--> `AppShell()`  [INFERRED]
  PROJECT_MAP.md → src/components/AppShell.tsx
- `Feature Inventory` --references--> `MobileBottomBar()`  [INFERRED]
  PROJECT.md → src/components/MobileBottomBar.tsx
- `5. TRAPS — THESE LOOK LIKE BUGS AND ARE NOT` --references--> `ArtLayer()`  [INFERRED]
  docs/AGENT-BRIEF.md → src/components/art/ArtLayer.tsx
- `Slice 10 — AI pipeline aborts and safety (P1)` --references--> `sseResponse()`  [INFERRED]
  PLAN.md → src/lib/ai/http.ts

## Import Cycles
- None detected.

## Communities (109 total, 6 thin omitted)

### Community 0 - "stress-contrast-tokens.test.ts"
Cohesion: 0.05
Nodes (35): accountItems, CLAMP_DEFINITIONS, ClampDef, composite(), contrastRatio(), coreFailures, darkGlassBg, darkOverlayBg (+27 more)

### Community 1 - "crawl.ts"
Cohesion: 0.06
Nodes (75): AccountPage(), metadata, runtime, AccountPanel(), Button(), Entitlements, Field(), Notice() (+67 more)

### Community 2 - "dialogue/route.ts"
Cohesion: 0.13
Nodes (26): bodySchema, EMPTY_USAGE, gate(), generateThroughChain(), Generation, noProvider(), PERSONA_IDS, personaId (+18 more)

### Community 3 - "Markdown.tsx"
Cohesion: 0.27
Nodes (12): BlockView(), InlineView(), Markdown(), markdownToText(), copyMessage(), Block, blocksToPlainText(), Inline (+4 more)

### Community 4 - "memory.ts"
Cohesion: 0.15
Nodes (17): D45 - Sensitive attributes are refused by regex, and the regexes were wrong twice, emptyMemoryProfile(), estimateTokens(), fitToBudget(), InterestTopic, MAX_MEMORY_CHARS, MAX_MEMORY_TOKENS, MemoryProfile (+9 more)

### Community 5 - "package.json"
Cohesion: 0.10
Nodes (34): dynamic, NO_STORE, POST(), publishSchema, runtime, dynamic, GET(), NO_STORE (+26 more)

### Community 6 - "content.ts"
Cohesion: 0.06
Nodes (30): byPathId, PATHS, personaIds, RAW_PATHS, STOICISM, canOpenLesson(), Entitlement, LessonAccess (+22 more)

### Community 7 - "site/route.ts"
Cohesion: 0.12
Nodes (27): zod, bodySchema, dynamic, runtime, dynamic, NO_STORE, POST(), readFunnel() (+19 more)

### Community 8 - "ArtLayer"
Cohesion: 0.15
Nodes (17): DialoguePage(), metadata, runtime, DEEP_LINKS, metadata, PathsPage(), runtime, metadata (+9 more)

### Community 9 - "scripts"
Cohesion: 0.05
Nodes (38): scripts, art:build, audit:full, audit:ui, audit:ui:quick, build, build:cf, build:pages (+30 more)

### Community 10 - "QuotesApp.tsx"
Cohesion: 0.05
Nodes (52): ARTIFACT_DIR, assignFocusIndexes(), auditLinks(), AXE_PATH, BASE_URL, classify(), Control, detectState() (+44 more)

### Community 11 - "signals/route.ts"
Cohesion: 0.19
Nodes (14): D41 - Two consent switches, never one, bodySchema, MonthAggregate, ok(), POST(), readConsent(), readGlobal(), runtime (+6 more)

### Community 12 - "aggregate.ts"
Cohesion: 0.08
Nodes (6): ADMIN_APIS, PRIMARY_11_ROUTES, TEST_USER, PORT, @playwright/test, errors

### Community 13 - "firestore-rest.ts"
Cohesion: 0.16
Nodes (22): DELETE(), dynamic, GET(), runtime, USER_SUBCOLLECTIONS, adminFetch(), deleteDocument(), deleteSubcollections() (+14 more)

### Community 14 - "firestore-rest.ts"
Cohesion: 0.09
Nodes (32): D40 - Cards are drawn in a canvas because shaping is the hard part, What is not built, What is not built, metadata, QuotesPage(), runtime, dayIndex(), FilterChip() (+24 more)

### Community 15 - "chain.ts"
Cohesion: 0.11
Nodes (19): amiri, cinzel, metadata, plexArabic, RootLayout(), runtime, viewport, GreekColumns() (+11 more)

### Community 16 - "AdminConsole.tsx"
Cohesion: 0.06
Nodes (65): framer-motion@^11.18.2, firebase, framer-motion, AdminPage(), metadata, runtime, Action(), AdminConsole() (+57 more)

### Community 17 - "site-store.ts"
Cohesion: 0.14
Nodes (21): args, candidatesFor(), report, candidatesFor(), roots, unrepairable, write, checkMojibake() (+13 more)

### Community 18 - "The golden token riddle"
Cohesion: 0.07
Nodes (39): D46 - The probability is never a number the client has, D47 - A ceiling is evaluated before the draw, not after, D48 - The random source is a parameter, so a distribution can be tested at all, D49 - Acceptance is phrase-level, and the first bank was wrong sixteen times, D50 - The token carries the philosopher, and the bank validates it, D51 - Redemption is a separate request from the roll, D52 - The leak gate is mechanical, and its term list is held honest by a test, D53 - IP counters are HMACs, and there is no counter without a secret (+31 more)

### Community 19 - "streaks.ts"
Cohesion: 0.17
Nodes (19): buildHeatmap(), addDays(), dayKeyFor(), dayRange(), daysBetween(), daysInMonth(), endOfMonth(), isValidTimeZone() (+11 more)

### Community 20 - "AGENT-BRIEF.md"
Cohesion: 0.17
Nodes (11): 1. STACK (verified, do not re-derive), 2. THE HARD CONSTRAINT — READ BEFORE TOUCHING ANY DEPENDENCY, 3. HOW TO BUILD AND VERIFY (this environment's quirks), 5. TRAPS — THESE LOOK LIKE BUGS AND ARE NOT, 7. WHAT WAS RECENTLY CHANGED (verify before you assume), 8. HOUSE RULES FOR CHANGES, 9. FIRST ACTION, AGENT BRIEF — عقل في صندوق / Mind in a Box (+3 more)

### Community 21 - "site/route.ts"
Cohesion: 0.16
Nodes (17): BURST_MAX_REQUESTS, BURST_WINDOW_MS, bursts, checkBurst(), checkQuota(), connection(), counterPaths(), decision() (+9 more)

### Community 22 - "tiers.ts"
Cohesion: 0.10
Nodes (23): ROBOTS_BLOCKED, runtime, CHROMELESS_ROUTES, desktopOverflow(), desktopPrimary(), GROUPS, HIDDEN_ROUTES, ICON_ALLOWLIST (+15 more)

### Community 23 - "4. المراحل التسع"
Cohesion: 0.17
Nodes (20): RFC-4180, avg(), buildExport(), csvField(), csvRow(), downloadText(), exportFilename(), JournalExport (+12 more)

### Community 24 - "mojibake.mjs"
Cohesion: 0.09
Nodes (22): SECTION C — Performance, WeekStrip(), buildRadar(), buildSeries(), correlateHabitsWithEnergy(), Correlation, DayPoint, HabitEnergyPoint (+14 more)

### Community 25 - "next"
Cohesion: 0.20
Nodes (8): next, dynamic, NO_STORE, POST(), runtime, schema, runtime, checkPricingConsistency()

### Community 26 - "nav.ts"
Cohesion: 0.19
Nodes (19): lucide-react, JournalPage(), metadata, runtime, CATEGORY_ICONS, CATEGORY_LABELS, COLOR_CLASSES, COLOR_LABELS (+11 more)

### Community 27 - "MemberLibrary.tsx"
Cohesion: 0.15
Nodes (18): D7 — `PremiumShield` is a deterrent, and says so, metadata, OraclePage(), runtime, metadata, runtime, SanctumPage(), ColonnadeBackdrop() (+10 more)

### Community 28 - "conversations.ts"
Cohesion: 0.21
Nodes (10): Header(), Conversation, ConversationMessage, ConversationsState, PersistedShape, readLocal(), renameRemote(), titleFrom() (+2 more)

### Community 29 - "The UI audit harness"
Cohesion: 0.06
Nodes (54): D68 - The audit crawls the route map, never the sitemap, D69 - A probe that cannot run is a P0, never an absence, D70 - The Tab walk presses real keys, and matches by index, D71 - The interaction pass reloads when the DOM is invalidated, D72 - An opacity-modified token is a different colour, and must be measured as one, D73 - `verify-contrast.mjs` validated tokens, and nobody validated usage, D76 - Backgrounds paint child-over-parent, so the ancestor walk may not stop early, D77 - Chrome reports the contents of a closed `<details>` as visible (+46 more)

### Community 30 - "site-schema.ts"
Cohesion: 0.32
Nodes (20): sseResponse(), overrideAdapters(), installMockAdapter(), main(), record(), resetMockState(), sleep(), testAiPostMidFlightCancellation() (+12 more)

### Community 31 - "e2e-ai-verification.test.ts"
Cohesion: 0.15
Nodes (17): backgrounds(), BACKGROUNDS, composite(), CSS, dark, light, luminance(), PAIRS (+9 more)

### Community 32 - "server.ts"
Cohesion: 0.17
Nodes (12): jose, AuthenticatedUser, AuthFailure, AuthResult, classify(), failureResponse(), GuardFailure, jwksFor() (+4 more)

### Community 33 - "quota.ts"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 34 - "WisdomChat.tsx"
Cohesion: 0.12
Nodes (17): dependencies, @dnd-kit/core@^6.3.1, @dnd-kit/sortable@^10.0.0, @dnd-kit/utilities@^3.2.2, firebase@^10.14.1, jose@^6.2.12, lucide-react@^0.395.0, next@14.2.35 (+9 more)

### Community 35 - "guards.ts"
Cohesion: 0.09
Nodes (16): nextConfig, aliases, args, COHERENCE, describe(), fileValues, fromFileOnly, isUsable() (+8 more)

### Community 36 - "audit-regression.spec.ts"
Cohesion: 0.25
Nodes (3): ACKNOWLEDGED, AUDIT_RAW, AUDIT_REPORT

### Community 37 - "package.json"
Cohesion: 0.07
Nodes (42): devDependencies, autoprefixer@^10.4.19, axe-core@^4.14.0, @cloudflare/next-on-pages@^1, eslint@8.57.0, eslint-config-next@14.2.35, firebase-tools@^13.35.1, @lhci/cli@^0.15.1 (+34 more)

### Community 38 - "i18n.tsx"
Cohesion: 0.32
Nodes (7): Ctx, isLocale(), LOCALE_BOOTSTRAP_SCRIPT, LocaleCtx, LocaleProvider(), Locale, FooterSimulatedSection

### Community 39 - "verify-contrast.mjs"
Cohesion: 0.22
Nodes (15): ANON_COOKIE_NAME, AnonymousSession, base64UrlFromBytes(), base64UrlToBytes(), encoder, FREE_ATTEMPT_LIMIT, hmacKey(), parseCookieHeader() (+7 more)

### Community 40 - "ai-consent.ts"
Cohesion: 0.16
Nodes (14): CONNECT_SRC, cspDirectives(), CspOptions, FONT_SRC, FRAME_SRC, IMG_SRC, renderCsp(), SCRIPT_SRC (+6 more)

### Community 41 - "assistant/route.ts"
Cohesion: 0.12
Nodes (13): artIndex, availableIds, bytesByFormat, emitted, errors, MANIFEST, OUT_DIR, plan (+5 more)

### Community 42 - "compilerOptions"
Cohesion: 0.12
Nodes (8): CSP_PATH, cspText, errors, HEADERS_PATH, headersText, notes, ROOT, TXT_PATH

### Community 43 - "AUDIT-UI — فحص الواجهة كما يراه المستخدم"
Cohesion: 0.29
Nodes (14): AiConsentSwitch(), isDayKey(), resolveTimeZone(), blankDay(), deviceId(), emptyPersisted(), loadRemoteJournal(), mergeDays() (+6 more)

### Community 44 - "lensToken.ts"
Cohesion: 0.18
Nodes (12): EnterPage(), metadata, runtime, EnterTemple(), ACCENT, accentFor(), Lens, lensById() (+4 more)

### Community 45 - "PLAN — عقل في صندوق / Mind in a Box (fix slices)"
Cohesion: 0.05
Nodes (41): AUDIT — عقل في صندوق / Mind in a Box (read-only), Commands (exact output), SECTION B — Design Violations, SECTION D — Copy & Language, SECTION E — Security & Privacy, 6. OPEN PROBLEMS — ranked by value/risk, Known-good, do not "fix", Tier 1 — the security-critical advisories that cannot be fixed in place (+33 more)

### Community 46 - "personas.ts"
Cohesion: 0.23
Nodes (10): checkThresholds(), ensureLocalServer(), generateReport(), PROJECT_ROOT, REPORT_DIR, runLighthouse(), runLighthouseForUrl(), writeFile() (+2 more)

### Community 47 - "DECISIONS"
Cohesion: 0.06
Nodes (32): D10 - Testing infrastructure, D11 - OpenNext runs Next.js on the Workers Node.js compatibility runtime, D12 - The Tailwind ramp is bound to theme-aware RGB triplets, D14 - The quotation archive stays empty until it can be sourced, D15 - Theme and locale apply pre-paint via inline bootstrap, D16 - Content is linted, not eyeballed, D17 - Admin is a document, not a custom claim, D18 - The billing record is server-written and client-invisible (+24 more)

### Community 49 - "chain.ts"
Cohesion: 0.10
Nodes (23): D22 - Failover is allowed only before the first byte, GET(), blank(), BreakerConfig, breakerSnapshot(), BreakerState, breakerState(), canAttempt() (+15 more)

### Community 50 - "server.ts"
Cohesion: 0.20
Nodes (10): ALLOWED, args, encodeWithinBudget(), FORMATS, main(), MAX_BYTES, OUT_DIR, processFile() (+2 more)

### Community 51 - "e2e-ai-verification.test.ts"
Cohesion: 0.10
Nodes (26): DialogueEvent, AiEvent, SSE_HEADERS, AnthropicChunk, createAnthropicAdapter(), createGeminiAdapter(), GeminiChunk, baseUrl() (+18 more)

### Community 52 - "4. المراحل التسع"
Cohesion: 0.08
Nodes (25): 1. جدول المرجعية, 2. الاتجاه الفني, 3. معمارية المعلومات, 4. المراحل التسع, 5. مقاييس النجاح, 6. خطة المخاطر, 7. جدول التنفيذ, MASTER_PLAN — عقل في صندوق | Mind in a Box (+17 more)

### Community 53 - "check-headers.mjs"
Cohesion: 0.22
Nodes (11): metadata, PrivacyPage(), runtime, SECTIONS, metadata, runtime, SECTIONS, TermsPage() (+3 more)

### Community 54 - "Header.tsx"
Cohesion: 0.15
Nodes (24): Architecture, Error(), runtime, Loading(), runtime, NotFound(), runtime, Footer() (+16 more)

### Community 55 - "ai/route.ts"
Cohesion: 0.07
Nodes (45): bodySchema, dynamic, emitStatic(), jsonError(), POST(), resolveAnonIdentity(), runtime, sse() (+37 more)

### Community 56 - "dependencies"
Cohesion: 0.26
Nodes (9): checkBundleSize(), collectMetrics(), generateFinalReport(), generateReport(), getGitCommit(), PROJECT_ROOT, REPORT_DIR, runLighthouseCheck() (+1 more)

### Community 57 - "lensToken.ts"
Cohesion: 0.17
Nodes (11): API_DIR, errors, files, GUARDS, publicRoutes, ROOT, rows, unguarded (+3 more)

### Community 58 - "signals/types.ts"
Cohesion: 0.20
Nodes (8): BlockReason, CONSENT_COPY_AR, CONSENT_NEVER_PROMISES, ConsentDecision, DEFAULT_CONSENT, DEFAULT_GLOBAL, GlobalSwitch, ConsentSwitch

### Community 59 - "conversations.ts"
Cohesion: 0.25
Nodes (9): ART_DIR, ensureFaviconAssets(), FAVICON_DIR, generateIcons(), generateManifest(), generatePWA(), generateServiceWorker(), PROJECT_ROOT (+1 more)

### Community 60 - "PROJECT_MAP — عقل في صندوق / Mind in a Box"
Cohesion: 0.25
Nodes (8): ARCHITECTURE, PROJECT_MAP — عقل في صندوق / Mind in a Box, Red team — 20 adversarial inputs, Signals — the AI's memory, SYSTEM_FLOW, TECH_STACK, The forbidden list, enforced, What was built

### Community 61 - "vitest"
Cohesion: 0.20
Nodes (9): art, $comment, defaults, formats, outputDir, quality, sourceDir, avif (+1 more)

### Community 62 - "check-api.mjs"
Cohesion: 0.27
Nodes (9): ALLOWED_LATIN, byRule, check(), findings, latinIsAllowed(), report(), ROOT, SCAN (+1 more)

### Community 63 - "ArtLayer.tsx"
Cohesion: 0.40
Nodes (4): ART_SPECS, ArtId, ArtLayerProps, ART_AVAILABLE

### Community 64 - "site-schema.ts"
Cohesion: 0.08
Nodes (31): SiteBuilder(), SortableNavRow(), ASSISTANT_SYSTEM_PROMPT_AR, AssistantInput, AssistantProposal, buildAssistantBrief(), isProposable(), PROPOSABLE_PATHS (+23 more)

### Community 65 - "streaks.ts"
Cohesion: 0.33
Nodes (7): AiConsent, AiJournalPayload, consentAllowsReading(), ConsentDecision, decideAiReading(), readJournalForAi(), shiftDay()

### Community 66 - "make-og.mjs"
Cohesion: 0.22
Nodes (7): ALLOW, findings, PATTERNS, PUBLIC_FIREBASE_KEY, SCAN_DIRS, SCAN_EXT, walk()

### Community 67 - "generate-pwa.mjs"
Cohesion: 0.22
Nodes (8): CONFIG, errors, OUTPUT, ROOT, SECRET_PATTERNS, SRC, walk(), workerEntry

### Community 68 - "app/page.tsx"
Cohesion: 0.15
Nodes (12): sharp@^0.35.5, sharp, HERO_OUT, HERO_SRC, PHIL_OUT, PHILOSOPHERS_SRC, processHero(), processPhilosophers() (+4 more)

### Community 69 - "DailyTracker.tsx"
Cohesion: 0.40
Nodes (7): SanctuaryCore(), SanctuaryCoreProps, SpatialBox(), isLowPowerDevice(), PointerFieldOptions, prefersReducedMotion(), usePointerField()

### Community 70 - "sanitize.ts"
Cohesion: 0.48
Nodes (5): saveToNote(), sanitizeContent(), sanitizeMessage(), sanitizeText(), sanitizeTitle()

### Community 71 - "AUDIT — عقل في صندوق / Mind in a Box (read-only)"
Cohesion: 0.38
Nodes (6): levelOrder, LogEntry, LogLevel, sanitize(), shouldLog(), write()

### Community 72 - "vitest"
Cohesion: 0.14
Nodes (8): @firebase/rules-unit-testing@^3.0.4, @firebase/rules-unit-testing, vitest, FIREBASE_ENV_KEYS, asAdmin(), asUser(), getFilesRecursive(), ROOT

### Community 73 - "prompt.ts"
Cohesion: 0.25
Nodes (7): extends, plugins, rules, react-hooks/exhaustive-deps, react/no-unescaped-entities, @typescript-eslint/no-unused-vars, next/core-web-vitals

### Community 74 - "site-config.ts"
Cohesion: 0.11
Nodes (24): Slice 9 — Store and config correctness (P1), D13 - Nav and pricing read from a validated config with a synchronous static default, metadata, PricingPage(), runtime, PricingGrid(), TierCard(), isInternalPath() (+16 more)

### Community 75 - "check-content.mjs"
Cohesion: 0.32
Nodes (5): args, openStream(), pieces(), PORT, server

### Community 76 - "test-check-env.mjs"
Cohesion: 0.25
Nodes (4): failures, GOOD, ROOT, SCRIPT

### Community 77 - "turnstile.ts"
Cohesion: 0.47
Nodes (4): secretFromEnv(), turnstileConfigured(), TurnstileResult, clientIp()

### Community 79 - "signals/types.ts"
Cohesion: 0.33
Nodes (5): ANSWER_PHRASES, leaks, SCAN_DIRS, SCAN_EXT, walk()

### Community 80 - "ملف عمل Gemini لمشروع عقل في صندوق"
Cohesion: 0.40
Nodes (4): برومبت تعديل بصري صغير, برومبت فريق التطوير والتحرير, تجربة السوق, ملف عمل Gemini لمشروع عقل في صندوق

### Community 81 - "Firebase Console — manual steps"
Cohesion: 0.50
Nodes (3): tailwindcss@^3.4.4, tailwindcss, config

### Community 82 - "AUDIT-UI — فحص الواجهة كما يراه المستخدم"
Cohesion: 0.11
Nodes (17): AUDIT-UI — فحص الواجهة كما يراه المستخدم, P0 — كل النصوص العربية المعروضة كانت حروفاً لاتينية, P0 — لا أحد يستطيع تسجيل الدخول, P1 — 8 عيباً, P1 — بقعة سوداء على الصفحة الفاتحة تكسر التباين, P1 — زر إعادة الفحص كان يرمي استثناءً قاتلاً, P1 — طلب معلّق في كل صفحة لزائر غير مسجّل, P1 — نص غير مقروء في 91 موضعاً (+9 more)

### Community 83 - "check-worker.mjs"
Cohesion: 0.83
Nodes (3): main(), testApiEndpoints(), testPages()

### Community 84 - "riddle.spec.ts"
Cohesion: 0.40
Nodes (4): ANSWER_PHRASES, ODDS_PHRASES, PAGES, RESOLUTION_PHRASES

### Community 86 - "AmbientAudioToggle.tsx"
Cohesion: 0.53
Nodes (4): AmbientAudioToggle(), createDrone(), DroneHandle, VOICES

### Community 87 - "react"
Cohesion: 0.16
Nodes (13): ORPHANS — confirmed dead, Phase B deletion candidates, ORPHANS & PENDING, PENDING — Cloudflare Workers release, Phase D — AI core (this pass), Phase D — what is NOT done, Recently completed (Phase B), react, HomePage() (+5 more)

### Community 88 - "guards.ts"
Cohesion: 0.18
Nodes (18): 4. NON-NEGOTIABLES — breaking any of these is a regression, Phase C — identity layer (this pass), POST(), dynamic, GET(), POST(), runtime, dynamic (+10 more)

### Community 89 - "مقارنة مزوّدي الدفع — Paddle مقابل Lemon Squeezy"
Cohesion: 0.14
Nodes (13): 1. التكلفة الاسمية — متطابقة, 2. الفرق الحقيقي — من يستطيع الشراء, 3. الفروق الثانوية, 4. التوصية, الأثر العملي, الخلاصة في سطر واحد, المراجع, ثانوية — سياق فقط، ليست أساس التوصية (+5 more)

### Community 90 - "WisdomChat"
Cohesion: 0.19
Nodes (12): SECTION A — Code & Logic Errors, D32 - The gate belongs to the surface that raised it, Deleted this pass, handleSignOut(), GateDialog(), ConversationList(), WisdomChat(), saveToJournal() (+4 more)

### Community 91 - "H. Cloudflare environment variables"
Cohesion: 0.40
Nodes (5): Build-time vs runtime, H. Cloudflare environment variables, Plain text — inlined into the bundle at build time, Secret — read at request time, never inlined, What `check:env` checks beyond presence

### Community 93 - "signals/types.ts"
Cohesion: 0.22
Nodes (8): FORBIDDEN_SIGNAL_KINDS, ForbiddenSignalKind, IdentifiedSignal, MAX_VALUE_LENGTH, Signal, SIGNAL_KINDS, SignalKind, TIME_BUCKETS

### Community 94 - "ملخص المشروع لإعادة تصميم الواجهة"
Cohesion: 0.20
Nodes (9): التقنية الفعلية, الحدود التي يجب الحفاظ عليها, الشاشات ومكوناتها, المطلوب بصرياً, المنتج, حالة العمل عند التسليم, خريطة القراءة المختصرة, طريقة العمل الاقتصادية (+1 more)

### Community 95 - "prompt.ts"
Cohesion: 0.24
Nodes (9): Acceptance criteria, D44 - The golden rule is enforced by construction, and the rule names itself, What the riddle does NOT ship — stated, not hidden, breaksGoldenRule(), buildMemoryBlock(), buildSystemMemorySection(), GOLDEN_RULE_AR, TOPIC_AR (+1 more)

### Community 96 - "journal/types.ts"
Cohesion: 0.22
Nodes (9): CheckIn, DayHabitTick, FREE_LIMITS, isDueOn(), JournalBlock, JournalTemplate, Practice, VirtueRatings (+1 more)

### Community 98 - "4-Tier Opaque-Box Testing Infrastructure for "The Living Sanctuary""
Cohesion: 0.18
Nodes (10): 1. Architectural Overview & Design Philosophy, 1. Playwright E2E Living Sanctuary Suite, 2. Backend & AI Engine Verification Suite, 2. Dual-Layer 4-Tier Architecture Diagram, 3. Detailed Test Matrix: "The Living Sanctuary" E2E Suite (`e2e/living-sanctuary.spec.ts`), 3. Full Unit & System Regression Suites, 4. Detailed Test Matrix: Backend & AI Engine Suite (`tests/e2e-ai-verification.test.ts`), 4-Tier Opaque-Box Testing Infrastructure for "The Living Sanctuary" (+2 more)

### Community 99 - "Project: mindinbox-final"
Cohesion: 0.22
Nodes (8): Asset Manifest & Picture Delivery Contract (`src/components/art/ArtLayer.tsx`), Code Layout, Design Tokens & Materials (`src/app/globals.css` & `src/app/studio.css`), DOM Selector Contracts for Playwright E2E Tests, Feature Inventory, Interface Contracts, Milestones, Project: mindinbox-final — The Living Sanctuary

### Community 100 - "Firebase Console — manual steps"
Cohesion: 0.22
Nodes (9): A. Project basics, B. Password policy, C. Identity Platform — the one that breaks account deletion, D. Service account (needed by the server, never the browser), E. Admin bootstrap, F. Turnstile, Firebase Console — manual steps, G. Firestore and Storage rules (+1 more)

### Community 101 - "Prompt 06 + 09 surfaces — what this pass built"
Cohesion: 0.22
Nodes (9): D36 - Journal AI consent is one switch, checked before any read, D37 - A day key is a calendar date, never an instant, D38 - Absence is not zero, everywhere in the journal, `/dialogue` (prompt 06 §7–8), New files this pass, Prompt 06 + 09 surfaces — what this pass built, Verification, What is still unverified (+1 more)

### Community 102 - "Cloudflare Workers deployment"
Cohesion: 0.29
Nodes (5): Build and preview, Cloudflare configuration, Cloudflare Workers deployment, Deployment gates, Variables and secrets

### Community 105 - "Prompt 09 — quotes: what was verified, and what was refused"
Cohesion: 0.29
Nodes (7): Acceptance criteria, D42 - The receiver ignores the client's claim about who it is, D43 - Aggregates, not a log, Prompt 09 — quotes: what was verified, and what was refused, Quotes considered and refused, The gate, The library

### Community 107 - "Dialogue.tsx"
Cohesion: 0.16
Nodes (10): Dialogue(), Phase, Turn, PersonaCard(), PersonaCards(), PERSONAS, consumeDialogue(), DialogueHandlers (+2 more)

### Community 111 - "Status: READY & VERIFIED (Dual-Layer 4-Tier Test Architecture)"
Cohesion: 0.18
Nodes (8): ArgumentGame(), rounds, 1. Executive Summary & Deliverables, 2. Test Execution Commands & Verification Status, 3. Coverage Matrix: 4-Tier Hierarchy for "The Living Sanctuary", 4. Implementation Insights & Notes for Milestone Teams, Status: READY & VERIFIED (Dual-Layer 4-Tier Test Architecture), Test Ready Report (`TEST_READY.md`)

### Community 113 - "Prompt 08 — the journal"
Cohesion: 0.40
Nodes (5): Acceptance criteria, honestly, D39 - "Verified" means the wording was read in the cited edition, Prompt 08 — the journal, What is deliberately absent, and why, What was built

### Community 114 - "WisdomChat.tsx"
Cohesion: 0.14
Nodes (13): BottomSheet(), QuotaMeter(), ActionButton(), OPENING_QUESTIONS, QUICK_PROMPTS, ResponseToolbar(), Status, recentWisdomTurns() (+5 more)

## Knowledge Gaps
- **2 isolated node(s):** `next/core-web-vitals`, `RFC-4180`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 923 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `crawl.ts`, `package.json`, `site/route.ts`, `ArtLayer`, `firestore-rest.ts`, `firestore-rest.ts`, `chain.ts`, `AdminConsole.tsx`, `The golden token riddle`, `tiers.ts`, `nav.ts`, `MemberLibrary.tsx`, `WisdomChat.tsx`, `package.json`, `ai-consent.ts`, `lensToken.ts`, `PLAN — عقل في صندوق / Mind in a Box (fix slices)`, `check-headers.mjs`, `Header.tsx`, `ai/route.ts`, `site-config.ts`, `react`, `guards.ts`, `WisdomChat`, `Dialogue.tsx`, `WisdomChat.tsx`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **What connects `next/core-web-vitals`, `RFC-4180` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `stress-contrast-tokens.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0524390243902439 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `crawl.ts`, `dialogue/route.ts`, `Markdown.tsx`, `memory.ts`, `package.json`, `firestore-rest.ts`, `AdminConsole.tsx`, `site-store.ts`, `The golden token riddle`, `streaks.ts`, `site/route.ts`, `4. المراحل التسع`, `mojibake.mjs`, `server.ts`, `package.json`, `verify-contrast.mjs`, `ai-consent.ts`, `PLAN — عقل في صندوق / Mind in a Box (fix slices)`, `chain.ts`, `e2e-ai-verification.test.ts`, `ai/route.ts`, `site-schema.ts`, `streaks.ts`, `site-config.ts`, `guards.ts`, `Dialogue.tsx`, `WisdomChat.tsx`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Should `crawl.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.060917343526039176 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `site/route.ts` to `site-schema.ts`, `WisdomChat.tsx`, `dialogue/route.ts`, `package.json`, `package.json`, `content.ts`, `signals/route.ts`, `firestore-rest.ts`, `The golden token riddle`, `ai/route.ts`, `next`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `dialogue/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12701612903225806 - nodes in this community are weakly interconnected._