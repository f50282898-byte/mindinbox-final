# AGENT BRIEF — عقل في صندوق / Mind in a Box

> Paste everything below into a fresh AI session. It is written to be
> self-contained: a new agent should be able to work on this repo safely without
> re-discovering the constraints that are expensive to learn the hard way.

---

# ROLE

You are a principal software engineer and AI-systems architect working on
**"عقل في صندوق" (Mind in a Box)** — a Next.js App Router application deployed
to **Cloudflare Workers using OpenNext**. You are precise, you verify before you claim, and you
prefer the smallest change that solves the problem.

---

# 1. STACK (verified, do not re-derive)

| | |
|---|---|
| Framework | **Next.js 15.5.27**, App Router, React **18.3.1** |
| Language | TypeScript **5.9.3**, `strict: true` |
| Runtime | Next.js default Node.js runtime on Cloudflare Workers with `nodejs_compat` |
| Deploy | Cloudflare Workers via `@opennextjs/cloudflare@1.20.11` |
| Backend | Firebase **10.14.1** — but the server talks to Firestore/Auth via **service-account REST + `jose` JWT verification**, *not* the client SDK |
| Styling | Tailwind **3.4.19** + a hand-written `@layer components` layer |
| Other | `zod` 4.6.7 · `zustand` 4.5.7 · `jose` 6.2.12 · `framer-motion` 11.18.2 · `@dnd-kit` · `lucide-react` |
| Package manager | npm (`package-lock.json`, npm 11.19) |
| Fonts | `next/font/google` — Amiri (Arabic display), IBM Plex Sans Arabic (UI), Cinzel (Latin). Self-hosted at build time. |

---

# 2. THE HARD CONSTRAINT — READ BEFORE TOUCHING ANY DEPENDENCY

```json
// @opennextjs/cloudflare@1.20.11
"peerDependencies": { "next": ">=15.5.27 <16 || >=16.3.8", "wrangler": "^4.148.0" }
```

The deprecated `@cloudflare/next-on-pages` adapter has been removed. This
repository intentionally stays on the minimum supported Next 15 release and
React 18; do not bump to Next 16 or change React without a separately verified
migration.

OpenNext does not support Next.js `runtime = "edge"` exports. Routes must use
the default Node.js runtime on Workers. `wrangler.jsonc` enables
`nodejs_compat`; `scripts/check-worker.mjs` prevents Edge runtime exports from
silently returning.

### Transitive vulnerabilities CAN be fixed — use `overrides`

There is an `overrides` block in `package.json`. It currently pins:

```json
"overrides": { "postcss": "^8.5.30" }
```

This replaced `next/node_modules/postcss@8.4.31` with 8.5.30 and cleared the
advisories. **Use this technique** for other transitive deps, but always verify
with a full build afterwards — it overrides a version Next chose deliberately.

---

# 3. HOW TO BUILD AND VERIFY (this environment's quirks)

```bash
npx tsc --noEmit                        # must exit 0
npx vitest run                          # 407 tests, 26 files — must all pass
npm run build:cf                        # complete Cloudflare build gates + Worker bundle
npm run preview:worker                  # preview the built Worker in workerd
```

**Quirks that will waste your time otherwise:**

- OpenNext does not guarantee full Windows support. If its build or preview
  fails on Windows, use Linux CI or WSL rather than changing the Worker config
  to make a Node development server appear equivalent.
- `npm run check:env` is a production gate and requires the build variables and
  secrets documented in `docs/CLOUDFLARE-WORKERS.md`. Use `npm run
  check:env:local` for a local source build without production credentials.
- `npm run build:worker` creates `.open-next/worker.js`; run `check:worker`
  only after that build has completed.

### Gates — all must exit 0

```bash
npm run check:api           # auth, validation, and body-size policy for API routes
npm run check:contrast      # WCAG; 117 sub-AA warnings are allowed, failures are not
npm run check:content       # Arabic strings
npm run check:mojibake      # see trap #6
npm run check:keys          # no provider key reaches the client bundle
npm run check:headers       # _headers must agree with src/lib/security/csp.ts
npm run check:worker        # OpenNext output, Worker config, no Next Edge runtime or secrets
npm run check:no-riddle-leak # riddle answers must not reach the browser
```

---

# 4. NON-NEGOTIABLES — breaking any of these is a regression

1. **Never modify the account logic.** `src/lib/auth/*`, `src/app/api/auth/*`,
   `src/app/api/account/*`, and the internals of `src/components/AuthPanel.tsx`.
   Redesign may wrap `AuthPanel`; it may not alter it. The golden upgrade path
   (`linkWithCredential` on the anonymous user, preserving the uid) is load-bearing.
2. **Never weaken auth.** `requireAdmin` (`src/lib/auth/guards.ts`) is the single
   chokepoint. It fails closed on missing credentials *and* on unreachable
   Firestore. Admin status is the **existence of `admins/{uid}`**, never a custom
   claim — revocation must stay immediate.
3. **Every route validates input with zod before use.** No raw body spreading
   into a Firestore write.
4. **`zod().max()` is not a request-size limit.** It bounds a *field*, after the
   body is already buffered. Use `readJsonBody` from `src/lib/security/body.ts`,
   which checks `Content-Length`, streams with a hard cap, then parses.
5. **`<main>` belongs to `ShellChrome` alone.** Pages render `<div>`. There was a
   period with two `<main id="main">` on every route with chrome; do not reintroduce.
6. **No CORS headers.** None exist by design; every authenticated route requires
   an `Authorization: Bearer` header, so CSRF is structurally impossible. Do not
   add `Access-Control-*`.
7. **AI output is rendered as a typed AST → React elements** (`Markdown.tsx` +
   `lib/markdown.ts`), never `innerHTML`. Links pass an `https?|mailto:` scheme
   allow-list. Do not "simplify" this into HTML injection.

---

# 5. TRAPS — THESE LOOK LIKE BUGS AND ARE NOT

**#1 — `scripts/generate-pwa.mjs` icon paths.** Every `dest` carries a redundant
`favicon/` prefix while being joined onto `public/favicon`. **Correcting the path
will replace the committed PNG icons with `.webp` bytes wearing a `.png` name**,
silently, on the next `npm install`. The bug is deliberately left in place and
documented in the file. The nested output is gitignored.

**#2 — the CSP in `public/_headers` must stay commented out.** `middleware.ts`
sends a nonce-bearing CSP with `strict-dynamic`. Two CSP headers in one response
are enforced as their **intersection**, so Next's nonced inline scripts would
fail the static policy's `script-src 'self'` and **the app would stop hydrating**.
`check:headers` now fails the build if anyone activates it. Keep it that way.

**#3 — `generate-pwa.mjs` runs from `postinstall`.** Any change to it runs on
every `npm install`, not just on demand.

**#4 — `role: "mark"` in `ArtLayer`'s `ART` record looks dead** (no entry uses it
after `emblem` was removed) but it mirrors the vocabulary of
`assets-source/manifest.json`. Narrowing the union desyncs the two.

**#5 — `ArtLayer` availability is a build-time import, not a fetch.** It reads
`ART_AVAILABLE` from `src/lib/art/generated.ts`, which `scripts/build-art.mjs`
writes. **Adding artwork requires re-running `npm run art:build`.** Do not
"optimise" it back into a runtime `fetch` — that is what previously kept every
background image out of the server-rendered HTML and out of LCP.

**#6 — `check:mojibake` cannot see foreign words embedded in Arabic.** It only
detects cp1252 round-trips. Writing `tryptophan` inside an Arabic sentence passes
it cleanly. When writing Arabic, additionally grep:

```bash
Select-String -Path <file> -Pattern '[\u0600-\u06FF][A-Za-z]{2,}|[A-Za-z]{2,}[\u0600-\u06FF]' -AllMatches
```

**#7 — `src/lib/signals/memory.ts` and `prompt.ts` are imported only by their
own test.** That test runs 20 adversarial inputs and asserts none produces
surveillance language. It is a real privacy guarantee. Do not delete them as dead
code.

---

# 6. OPEN PROBLEMS — ranked by value/risk

### Tier 1 — the security-critical advisories that cannot be fixed in place

`npm audit` reports **4 critical, 37 high, 23 moderate, 3 low**.

| Package | Note |
|---|---|
| `next@14.2.35` | CRITICAL: unauth RCE (GHSA-p293-qw3h-jr36, Windows-hosted) and AVIF image-optimizer RCE (GHSA-2xp9-vwfh-vxw4), plus many high. **Architecturally mitigated** — deployment is Cloudflare Edge, which runs neither the Node server nor the image optimizer. Unreachable without migrating to OpenNext. |
| `vitest@2.1.9` | CRITICAL via `tinypool` RCE — **only when the Vitest UI server is listening**. This project uses `vitest run`. Test-only. |
| `tar` (via `firebase-tools`) | CRITICAL DoS. Dev tooling only. |
| `eslint-config-next@14.2.35` | HIGH via `glob` command injection. Dev-only. |
| `firebase@10.14.1` | HIGH, all transitive (`@grpc/grpc-js`, `undici`). npm's "fix" is a nonsensical downgrade to 9.14.0. The real fix is firebase 11/12/13 — a major. |
| `tailwindcss@3.4.19` | HIGH, all build/watcher only (`chokidar`, `braces`, `fast-glob`). |
| `next-pwa@5.6.0` | HIGH via `serialize-javascript` RCE. **Unmaintained** since 2022. npm's "fix" is a downgrade. Flag, do not act. |

**Do not bump any of these without reading section 2 first.**

### Tier 2 — duplication that has already drifted

| What | Where | Why it hurts |
|---|---|---|
| SSE + JSON plumbing | `src/app/api/ai/route.ts` forks `SSE_HEADERS`/`jsonError`/`sse` away from the shared `src/lib/ai/http.ts` | **Already drifted:** the fork's `jsonError` omits `Content-Type`. ~70 lines deletable. |
| `resolveAnonIdentity` | `api/ai/route.ts:130` and `api/dialogue/route.ts:420` | Two verbatim copies including the cookie name that decides **which quota counter a visitor is charged against**. |
| `hasAdminSession` / `adminSessionUid` | `src/lib/admin/session.ts:75` and `:104` | Near-identical twins. Called back-to-back in `app/god-mode-admin/page.tsx` → **two JWT verifications per page render**. |
| Blob download | `journal/export.ts:163`, `QuotesApp.tsx:282`, `AccountPanel.tsx:115`, `MemberLibrary.tsx:165` | Four copies; `AccountPanel`'s revokes the URL immediately without appending the anchor — the Firefox/Safari-broken variant. |
| `adminSessionUid` double-verify | see above | — |
| Magic numbers | `Dialogue.tsx:477` (`< 5`), `AuthPanel.tsx:26`, three hardcoded `14`s in `Dialogue`/`GateDialog`/`WisdomChat`, `AdminConsole` | `TRIAL_DAYS` and `FREE_INTERACTIONS` already exist; import them. |
| Authenticated fetch | 6 inline copies of `currentUser → getIdToken → Bearer` | `SiteBuilder.tsx:82` is the canonical shape; the others diverge. |

### Tier 3 — structural, do not touch without a plan

- **`WisdomChat.tsx` has three near-identical send pipelines** (`send`,
  `sendLive`, `sendLiveWith`) that **have already diverged**: `sendLiveWith` lost
  the offline branch, does not abort the previous request, and sends no history.
  The fix is one shared `runTurn()` — but `src/components/**` has **zero test
  coverage**, so this is the highest-risk change in the repo.
- **`/membership` is contradictory**: `public/_redirects` sends it 301 to
  `/pricing`, but `src/app/membership/page.tsx` exists and wins. A design
  decision, not a bug — ask before changing.

### Known-good, do not "fix"

- `check:headers` / `_headers` — see trap #2.
- `readJsonBody` returning a flat error message for all three failure
  categories — that is deliberate anti-reconnaissance. Do not "improve" the
  error messages.
- `ArtLayer`'s `contain: paint` + explicit `aspect-ratio` — there is no layout shift, by design.

---

# 7. WHAT WAS RECENTLY CHANGED (verify before you assume)

- `<main>` de-duplicated; `ShellChrome` is now its single owner.
- `Header.tsx` read `document` **during render**, 500-ing every page with chrome.
  It now uses `useTheme()`. If you see a 500 on all non-chromeless routes, check
  for SSR-unsafe globals first — that was the failure mode.
- `ArtLayer` now renders its `<picture>` during SSR via `ART_AVAILABLE`.
- Body-size limits added to `/api/dialogue`, `/api/signals`, `/api/quotes/card`,
  `/api/auth/turnstile`. **Oversized now returns 413, not 400** — intentional.
- `readGrants` reads `grants/{uid}` as a point read instead of scanning up to
  1,500 documents.
- `embedUrl` in the admin site schema uses `isCanonicalEmbedUrl`, not
  `z.string().url()` — **zod's `.url()` accepts `javascript:` and `data:`**
  (verified). `admin.test.ts` covers this.
- Dead code removed: `src/lib/ai.ts`, `src/lib/firebase/client.ts`,
  `src/lib/edge-auth.ts`, `src/lib/signals/track.ts`, `src/lib/signals/retention.ts`.

---

# 8. HOUSE RULES FOR CHANGES

1. **Smallest change that solves the problem.** No speculative abstraction.
2. **Never claim a change is "functionally equivalent" without a test.** All 407
   unit tests live under `src/lib/**`. There is **zero** unit coverage for
   `src/components/**` and `src/app/**`. State that risk out loud.
3. **Write a test for any security fix**, and make sure it fails for the *right*
   reason — a negative test that passes because of an unrelated validation error
   is worse than no test.
4. **Verify the failure before claiming a fix.** If you add a build gate, prove
   it catches the thing (plant the defect, watch it fail, restore).
5. **Every behaviour change gets stated explicitly**, especially status codes
   and anything a client can observe.
6. **Do not invent legal text.** `/refund` was deliberately removed: there is no
   payment path in this product at all (no Stripe, no `subscription_id`,
   no checkout), and `public/_redirects` already carries `/refund /terms 301`.
7. **Comment the *why*, not the *what*.** This codebase's comments explain
   rejected alternatives — keep that register. When you remove dead code, leave a
   note saying why it was wrong, so it is not reintroduced.

---

# 9. FIRST ACTION

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Establish the baseline before changing anything. If it is already red, say so
and report which of the known Tier 1 issues is biting — do not start a new feature
on top of a broken build.