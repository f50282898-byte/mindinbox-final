# PLAN — عقل في صندوق / Mind in a Box (fix slices)

Source: `AUDIT.md` (2026-10-05, P0/P1 author-verified). Baseline is green:
`typecheck` clean, `lint` clean, `build` succeeds on retry (first-run ENOENT was
a stale `.next` artifact, not a source defect) — so there is no build-repair slice.
`docs/audit/VISUAL_AUDIT.md` had not landed when this plan was written; where a
slice touches visual criteria ([TY]/[SG]/[AU]/[ST]), its criteria cite `AUDIT.md`
lines and the slice adopts matching `VISUAL_AUDIT.md` FAILs when it lands instead
of inventing new work. Each file appears in exactly one slice; multi-severity
files are fixed line-scoped in their owner slice. "States" (P2) need no separate
slice: every states item is line-scoped inside its owner's slice.

---
### Slice 1 — Auth crash on signup / guest upgrade (P0)
**Goal:** Make email signup and anonymous-upgrade work when a display name is given.
**Files (≤15):** `src/lib/auth/client.ts`, `src/lib/firebase/profile.ts`
**Acceptance Criteria (measurable):**
  - [ ] `signUp` with a display name completes without throwing (guest-upgrade and fresh paths)
  - [ ] `npm run typecheck` still clean (the false type came from declaration merging)
**Risks:** Firebase `User` shape differs across SDK minors; pin behavior with a unit test using a fake user object.
**Effort:** S
---
### Slice 2 — Dialogue multi-round wipe/duplication (P0)
**Goal:** Rounds 2–3 no longer clear or duplicate earlier turns.
**Files (≤15):** `src/components/Dialogue.tsx`, `src/lib/dialogue-client.ts`, `src/lib/dialogue-client.test.ts`
**Acceptance Criteria (measurable):**
  - [ ] 3-round dialogue keeps round-1 text intact when round 2 streams (unit + manual)
  - [ ] Failed round removes its placeholder bubbles; a failed round stops rounds 3 (`Dialogue.tsx:98,228`)
**Risks:** Streaming event shape may not carry a stable turn id; if absent, fall back to append-order ids.
**Effort:** M
---
### Slice 3 — Quota counters and grant lookup (P0)
**Goal:** The per-IP daily ceiling actually fires, and grants beyond the fifth document still entitle.
**Files (≤15):** `src/lib/quota.ts`, `src/lib/quota.test.ts`, `src/lib/entitlements.ts`
**Acceptance Criteria (measurable):**
  - [ ] IP counter uses an even-segment doc path; `quota.test.ts` covers check+spend on that path
  - [ ] A uid whose grant is the 6th+ document still resolves its tier; salt<32 logs a warning (`quota.ts:146`)
**Risks:** Changing the counter path orphans existing counters; acceptable (counters are daily) but deploy note needed.
**Effort:** M
---
### Slice 4 — Firestore rules vs client reality (P0)
**Goal:** Every collection the client writes is allowed by the rules it ships with.
**Files (≤15):** `firestore.rules`, `storage.rules`, `src/lib/session.ts`, `src/lib/conversations.ts`
**Acceptance Criteria (measurable):**
  - [ ] New `users/{uid}/conversations/{id}` match; conversation sync stops failing silently
  - [ ] Telemetry field set and `analyticsSessions` allowlist agree (both directions); no more denied heartbeats
  - [ ] `storage.rules` oracle predicate mirrors `getEntitlements` (subscriptions + grants + trial)
  - [ ] Legacy `entries` writes become self-only; `analyticsSessions` update enforces `hasOnly`
**Risks:** Rule edits need the emulator suite (`npm run test:rules`, needs JRE) — without it this slice ships unverified.
**Effort:** M
---
### Slice 5 — Wisdom live streaming (P1)
**Goal:** Tokens appear as they arrive instead of an empty bubble until completion.
**Files (≤15):** `src/components/WisdomChat.tsx`, `src/lib/stream-client.ts`
**Acceptance Criteria (measurable):**
  - [ ] During a stream the bubble shows running text; final content still comes from `outcome.text`
  - [ ] `sendLive` no longer recreates per chunk (accumulator in ref); scroll respects reduced-motion and near-bottom gating; header delete also deletes remotely; floating `syncTo` handled
**Risks:** Per-token store patches regress performance; keep final-set-from-outcome as the single write path.
**Effort:** M
---
### Slice 6 — Account & journal personal surfaces (P1)
**Goal:** Deletion requires proof, and journal/account mirrors stay truthful.
**Files (≤15):** `src/components/AccountPanel.tsx`, `src/components/Journal.tsx`
**Acceptance Criteria (measurable):**
  - [ ] Non-anonymous delete re-authenticates with `deletePassword` (or the field is removed)
  - [ ] `Journal.remove()` updates the zustand mirror optimistically with rollback; loading skeleton replaces the bare dash
  - [ ] Password/email forms stop sharing one `currentPassword` state; export download works in Firefox/Safari
**Risks:** Re-auth flow changes the delete UX copy; keep the two-step order (Firestore first, Auth second).
**Effort:** M
---
### Slice 7 — Route gating is server-side (P1)
**Goal:** `/admin` stops serving console markup to strangers; tier pages stop trusting the client.
**Files (≤15):** `src/app/admin/page.tsx`, `src/app/god-mode-admin/page.tsx`, `src/app/oracle/page.tsx`, `src/app/sanctum/page.tsx`, `src/app/account/page.tsx`
**Acceptance Criteria (measurable):**
  - [ ] `/admin` checks `hasAdminSession()` + `notFound()` like god-mode-admin; null uid guarded
  - [ ] `/oracle` + `/sanctum` verify entitlement server-side (redirect/`notFound` when lacking)
  - [ ] `/account` either checks session server-side or documents client-local data; god-mode canonical fixed
**Risks:** Server checks can break cultural deep-links (`/oracle` from `/paths`); preserve the links, gate the content.
**Effort:** M
---
### Slice 8 — Secret separation and safe transport (P1)
**Goal:** One key never does two jobs, and upstreams never go plaintext.
**Files (≤15):** `src/lib/riddle/secret.ts`, `src/lib/admin/session.ts`, `src/lib/ai/providers/index.ts`, `src/lib/http.ts`, `src/lib/auth/guards.ts`
**Acceptance Criteria (measurable):**
  - [ ] No fallback between `ANON_SESSION_SECRET` / `RIDDLE_SIGNING_SECRET` / `ADMIN_PAGE_SECRET`; missing secret fails closed with a clear log
  - [ ] Provider `baseUrl` requires https (parity with `anthropic.ts:46`); `x-real-ip` trusted only behind a known proxy
  - [ ] Auth identity symbol is module-private, not `Symbol.for`
**Risks:** Failing closed on missing secrets can lock out staging; gate the requirement by environment.
**Effort:** M
---
### Slice 9 — Store and config correctness (P1)
**Goal:** UI state stops lying about admin, tier, dates, and remote content.
**Files (≤15):** `src/lib/store.ts`, `src/lib/journal/store.ts`, `src/lib/journal/export.ts`, `src/lib/site-config.ts`, `src/lib/nav.ts`, `src/lib/markdown.ts`
**Acceptance Criteria (measurable):**
  - [ ] Admin/tier accept verified-false downgrades; day comparison uses full yyyy-mm-dd
  - [ ] `flush`/`observeRemote` subscribe once with stored unsub; export chunked or size-guarded
  - [ ] `normaliseNav` preserves `primaryDesktop`; `realLimits` no longer inverts unlimited features; inline-URL indices computed on the buffer
**Risks:** Store shape changes ripple into many components; run the full vitest suite, not just touched files.
**Effort:** M
---
### Slice 10 — AI pipeline aborts and safety (P1)
**Goal:** Caller aborts actually stop work, and the safety net has no typos.
**Files (≤15):** `src/lib/ai.ts`, `src/lib/ai/chain.ts`, `src/lib/ai/http.ts`, `src/lib/ai/safety/wellbeing.ts`, `src/lib/signals/retention.ts`
**Acceptance Criteria (measurable):**
  - [ ] `AbortError` breaks (not continues) the provider chain; `sseResponse` honors the request signal
  - [ ] `ACUTE_PATTERNS` typo fixed with a regression test; retention prunes every month older than the window
  - [ ] Empty keep-alive chunk no longer forces failover (or is proven impossible per chunk type)
**Risks:** Abort-path changes are hard to observe; cover with `chain.test.ts` cases before touching UI.
**Effort:** M
---
### Slice 11 — Admin console data integrity (P1)
**Goal:** The console stops crashing on, or persisting, malformed content.
**Files (≤15):** `src/components/AdminConsole.tsx`, `src/components/admin/PricingCheck.tsx`, `src/components/admin/SiteBuilder.tsx`, `src/components/admin/AdminGate.tsx`, `src/lib/admin/site-store.ts`, `src/lib/admin/audit.ts`
**Acceptance Criteria (measurable):**
  - [ ] `PricingCheck` validates array shape before `.map`; rows default missing fields; no `key={index}` misassignment; empty rows never persist
  - [ ] Preview iframe refreshes after edits (or offers reload) and is sandboxed; verification attempts report status
  - [ ] Undo bumps version; audit ids are collision-proof
**Risks:** Admin writes shape what readers see; validate against the same schema the readers parse with.
**Effort:** M
---
### Slice 12 — Shell keyboard access and dialogs (P1)
**Goal:** Every chrome control reachable and operable without a pointer.
**Files (≤15):** `src/components/Shell.tsx`, `src/components/ShellChrome.tsx`, `src/components/Sidebar.tsx`, `src/components/GateDialog.tsx`, `src/components/Turnstile.tsx`
**Acceptance Criteria (measurable):**
  - [ ] Desktop rail expands via keyboard (focus + explicit control); mobile drawer traps and restores focus
  - [ ] Gate dialog focuses a real control on open; `usePathname()` null guarded in both call sites; sign-out errors surfaced
  - [ ] Missing Turnstile key renders an explanatory `role=alert` instead of nothing; RTL animation directions corrected; theme labels fully bilingual
**Risks:** Focus-trap changes easily strand mobile screen-reader users; test the More sheet + drawer with a real reader pass.
**Effort:** M
---
### Slice 13 — Riddle game integrity (P1)
**Goal:** The token game is closable, readable, and keyboard-safe.
**Files (≤15):** `src/components/riddle/RiddleSession.tsx`, `src/components/riddle/GoldenToken.tsx`, `src/components/GoldenSymbols.tsx`
**Acceptance Criteria (measurable):**
  - [ ] No-credential open returns to `challenge` (never an empty `playing` dialog); Escape closes with focus restored
  - [ ] Token no longer withdraws on blur; focused subtree is never `aria-hidden`; symbols dialog has Escape + trap
**Risks:** Timing changes (withdraw/visible windows) alter game feel; keep durations, change only triggers.
**Effort:** S
---
### Slice 14 — Library, quotes, journal-app surfaces (P1)
**Goal:** Content pages stop losing, mislabeling, or over-fetching user content.
**Files (≤15):** `src/components/MemberLibrary.tsx`, `src/components/MembershipBanner.tsx`, `src/components/Membership.tsx`, `src/components/PricingGrid.tsx`, `src/components/quotes/QuotesApp.tsx`, `src/components/journal/JournalApp.tsx`, `src/components/journal/Charts.tsx`, `src/components/journal/AiConsentSwitch.tsx`, `src/components/Markdown.tsx`, `src/components/Logo.tsx`
**Acceptance Criteria (measurable):**
  - [ ] Firestore `href`s validated before render; member-limit copy branches on actual tier; consent switch fully Arabic
  - [ ] Downloads revoke late (never 0ms) in both download paths; filenames never render as `"-.pdf"`; anchors attached before click
  - [ ] Headings preserve outline level; SVG ids unique per instance; art `sizes` per placement; decorative art lazy; empty-results offers reset
**Risks:** Ten files tempts drive-by refactors; each file gets only its listed fix, nothing more.
**Effort:** M
---
### Slice 15 — Motion, paint, and shell cost (P1)
**Goal:** Animation under control and first paint cheaper, in both themes.
**Files (≤15):** `src/components/art/ArtLayer.tsx`, `src/components/GreekColumns.tsx`, `src/components/GoldDust.tsx`, `src/components/DailyTracker.tsx`, `src/components/PersonaCards.tsx`, `src/app/layout.tsx`, `src/app/globals.css`
**Acceptance Criteria (measurable):**
  - [ ] No motion above 400ms except the deliberate landing intro; reduced-motion disables parallax/motes/chart animation; manifest fetched once
  - [ ] Touch deletes always visible (journal + tracker); tracker ids use a synced flag; day clock rolls past midnight
  - [ ] Root-layout dynamic cost documented or scoped; no `bg-*`/`text-*` utilities pinning the theme
**Risks:** Motion cuts change brand feel; keep the landing intro, cut the gratuitous 500–700ms tails first.
**Effort:** M
---
### Slice 16 — Edge auth and serving robustness (P1)
**Goal:** Slow upstreams degrade instead of hanging, caches stay bounded.
**Files (≤15):** `src/lib/edge-auth.ts`, `src/lib/auth/server.ts`, `src/lib/google/token.ts`, `src/lib/signals/track.ts`, `src/app/page.tsx`
**Acceptance Criteria (measurable):**
  - [ ] JWKS fetch has a 5s timeout; project-keyed cache bounded to one static set with validation
  - [ ] Service-account JSON parsed once and cached; guest signal buffer capped (drop-oldest)
  - [ ] JSON-LD script carries the request nonce; landing uses a single `<main>` landmark
**Risks:** Caching auth material trades freshness for speed; keep the documented 5s tolerance, never extend it silently.
**Effort:** M
---
### Slice 17 — Chrome copy-structure and document hygiene (P2)
**Goal:** Auth chrome, legal document, and crawler files say exactly what they mean.
**Files (≤15):** `src/components/AuthPanel.tsx`, `src/components/LegalDocument.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/robots.ts`
**Acceptance Criteria (measurable):**
  - [ ] Email inputs `dir="ltr"`; tab pattern complete (roving tabindex, panels); legal paragraphs carry `lang`/`dir`; anchor offset clears the sticky header
  - [ ] 404/error bodies bilingual; robots `disallow` derived from `HIDDEN_ROUTES`, no stray named exports
**Risks:** Bilingual error copy doubles strings to maintain; keep English secondary and short.
**Effort:** S
---
### Slice 18 — Trust and config hygiene (P2)
**Goal:** Degraded configurations announce themselves instead of silently weakening.
**Files (≤15):** `src/lib/security/csp.ts`, `src/lib/log.ts`, `src/lib/paths/gate.ts`
**Acceptance Criteria (measurable):**
  - [ ] Unintegrated payment origins removed from `connect-src`; error logging redacts to codes, never message text
  - [ ] Lesson-access reasons distinguish free/member/unlocked instead of mislabeling paid-unlocked as free
**Risks:** CSP tightening can break preview tooling; verify `/admin` and Turnstile flows after the change.
**Effort:** S
---
### Slice 19 — Micro-correctness (P3)
**Goal:** Close the nits that erode trust in details.
**Files (≤15):** `src/lib/ai/breaker.ts`, `src/app/paths/page.tsx`
**Acceptance Criteria (measurable):**
  - [ ] Breaker honors injected `now` end-to-end (tests control the clock)
  - [ ] Deep-link tiers typed as `TierId[]` with no cast
**Risks:** None material; keep the diff to the listed lines.
**Effort:** S
---
### Slice 20 — Copy and Arabic grammar (P3)
**Goal:** Every user-facing string grammatical, consistent, and correctly encoded.
**Files (≤15):** `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/refund/page.tsx`, `src/components/QuotaMeter.tsx`, `src/app/tracker/page.tsx`
**Acceptance Criteria (measurable):**
  - [ ] `中国大陆` fragment, `تُحفّظ`, and `فعاد إليها مالك` fixed; quota counts use Arabic plural rules; tracker og-alt bilingual
  - [ ] All rendered-string mojibake replaced (`AccountPanel:209`, `WisdomChat:864`, `PersonaCards:86`, `MemberLibrary:305/343/461`, `QuotesApp:318`, `Dialogue:300`) — line-scoped in owner slices 6, 5, 15, 14, 14, 2; this slice owns only its five files
  - [ ] `scripts/check-mojibake.mjs` passes and gains the newly found byte-patterns if missing
**Risks:** Arabic copy edits invite taste debates; change grammar/encoding only, never voice.
**Effort:** S
