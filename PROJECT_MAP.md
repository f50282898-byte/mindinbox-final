# PROJECT_MAP — عقل في صندوق / Mind in a Box

Phase A (read-only audit) + Phase B (implementation). Source of truth for *what the system is*;
`AUDIT.md` is the source of truth for *what is wrong with it*.

Last updated: 2026-10-03 · commit `5c766a0` + Phase B changes · deployed at `mindinbox-final.pages.dev`

---

## TECH_STACK

| Layer | Choice | Version | Pinned? |
|---|---|---|---|
| Framework | Next.js (App Router) | `14.2.35` | exact ✓ (was 14.2.15, updated to latest 14.2.x patch) |
| UI runtime | React / React DOM | `18.3.1` | exact ✓ (rule: no 19) |
| Hosting | Cloudflare **Pages** | — | ⚠ adapter deprecated, see AUDIT §8 |
| Runtime | Cloudflare Workers (Edge) | - | API routes declare `runtime = "edge"`; pages are statically prerendered (see D11) |
| Database / Auth | Firebase **Client** SDK | `^10.12.2` → `10.14.1` | floats |
| Firestore cache | `persistentLocalCache` + `persistentMultipleTabManager` | — | current API, not deprecated |
| Animation | Framer Motion | `^11.2.10` → `11.18.2` | floats |
| Icons | Lucide React | `^0.395.0` | floats |
| Client state | Zustand (+ `persist`) | `^4.5.2` → `4.5.7` | floats |
| Styling | Tailwind CSS | `^3.4.4` | floats |
| Fonts | Playfair Display (Latin) · Cairo (Arabic UI) · Amiri (Arabic display) | via `next/font` | — |
| Validation | **Zod** | `^4.6.5` | ✅ added (was missing) |
| JWT/Crypto | **jose** | `^6.2.12` | ✅ added (was missing) |
| Drag/Drop | **@dnd-kit/core** | `^6.3.1` | ✅ added (for admin) |
| | **@dnd-kit/sortable** | `^10.0.0` | ✅ added |
| | **@dnd-kit/utilities** | `^3.2.2` | ✅ added |
| Styling | Tailwind CSS | `^3.4.4` | floats |
| Fonts | Playfair Display (Latin) · Cairo (Arabic UI) · Amiri (Arabic display) | via `next/font` | — |
| Validation | **Zod** | `^4.6.5` | ✅ added |
| JWT/Crypto | **jose** | `^6.2.12` | ✅ added |
| Drag/Drop | **@dnd-kit/core** | `^6.3.1` | ✅ added |
| | **@dnd-kit/sortable** | `^10.0.0` | ✅ added |
| | **@dnd-kit/utilities** | `^3.2.2` | ✅ added |
| Testing | **Vitest** | `^2.0.5` | ✅ added |
| | **Playwright** | `^1.51.1` | ✅ added |
| Linting | **ESLint** | `8.57.0` | ✅ configured |
| Adapter | `@cloudflare/next-on-pages` | `^1.13.16` | ⚠ **deprecated** |
| Deploy tooling | `wrangler` | `^3.112.0` → `3.114.17` | latest is `4.147.0` |

**Palette** — `--volcanic #050505` · `--gold #D4AF37` (+ `--gold-light #E7D9A1`,
`--gold-muted #D9D0BA`, `--gold-dark #AA8C2C`). Single source: `src/app/globals.css:12-18`.

---

## SYSTEM_FLOW

```
Browser
  │
  ├─ layout.tsx ──> Sidebar (glass rail) + AppShell
  │                   ├─ useSession()        → Firebase auth → store
  │                   ├─ useSessionTelemetry()→ analyticsSessions (uid + duration only)
  │                   ├─ MembershipBanner     → siteConfig/ads  (free tier only)
  │                   ├─ GoldenSymbols        → users/{uid}/puzzles
  │                   └─ GateModal            → fires when attemptsLeft hits 0
  │
  ├─ Pages (all `runtime = "edge"`)
  │     /            cinematic hero — CSS colonnade + gold dust, one gold CTA
  │     /wisdom      Ask the Wise — persona picker, allowance meter, composer
  │     /tracker     daily tracker — Firestore live stream, gold bar chart
  │     /membership  three-tier ladder
  │     /oracle      MemberLibrary (requires oracle+)
  │     /sanctum     MemberLibrary (requires sanctum) + masterclasses + community
  │     /admin       AdminConsole — server-verified admin claim only
  │
  └─ POST /api/ai ──> verifyIdToken (RS256 + JWKS)   [edge-auth.ts]
                      ├─ tier claim?  → skip anonymous metering
                      └─ else         → readSession → HMAC cookie
                                        ├─ 0 left  → 402 { code: "gate" }
                                        └─ spend    → askWithFailover
                                                      gemini → groq → nvidia → bytez
                                                      (raw fetch, no SDK)
                     200 { text, via, remaining }

     POST /api/admin/verify ──> verifyIdToken → report { isAdmin }  (grants nothing)
```

**Tier gate in code.** `api/ai/route.ts:81` treats a token carrying `tier`/`subscriptionTier`
of `oracle`/`sanctum` as a member and skips metering. ⚠ Those claims are minted **outside this
repository** — no code here writes them (AUDIT 7.6).

---

## ARCHITECTURE

```
C:\mindinbox-final
├── next.config.mjs          single Next config; stubs fs/path/os/crypto/net/tls/child_process
├── package.json             13 runtime deps (all used), 11 dev deps
├── firestore.rules          109 lines — custom claims, closed key sets, bounded trial
├── storage.rules            27 lines — premium-library, PDF-only, <20 MB
├── firebase.json            rules deploy target
├── .env.example             annotated; 2 documented vars are dead (AUDIT 1.5)
├── .env.local               gitignored, real keys, local-only
├── public/_headers          CSP + HSTS + … — **not reaching production** (AUDIT 4.3)
├── EDGE_DEPLOYMENT.md       legacy doc, partly false (AUDIT 1.4)
├── AUDIT.md                 ← Phase A deliverable
├── PROJECT_MAP.md           ← this file
├── scripts/
│   ├── check-edge.mjs       edge runtime guard (Node built-ins, runtime=edge, secrets in build)
│   └── check-no-riddle-leak.mjs   build gate: no answer, resolution or odds in the client
├── vitest.config.ts         unit test config
├── playwright.config.ts     e2e config (mobile RTL + desktop)
├── .eslintrc.json           lint config (extends next/core-web-vitals + @typescript-eslint)
│
└── src/
    ├── app/
    │   ├── layout.tsx                 3 fonts, skip link, RTL shell
    │   ├── globals.css                design system, reduced-motion, IP-shield CSS
    │   ├── page.tsx                   /            Start Now
    │   ├── wisdom/                    /wisdom      Ask the Wise
    │   ├── tracker/                   /tracker     daily tracker
    │   ├── membership/                /membership  tier ladder
    │   ├── oracle/                    /oracle      MemberLibrary(oracle)
    │   ├── sanctum/                   /sanctum     MemberLibrary(sanctum)
    │   ├── admin/                     /admin       God Mode
    │   ├── utopia/                    redirect → /wisdom        (orphan, AUDIT 1.2)
    │   ├── god-mode-admin/            redirect → /admin         (orphan, AUDIT 1.1)
    │   └── api/
    │       ├── ai/route.ts                        edge · metering + failover
    │       └── admin/verify/route.ts              edge · reports admin claim
    │
    ├── components/   15 files — every one has a real importer
    │   ├── Sidebar · AppShell · GateModal · MembershipGate
    │   ├── WisdomHub · DailyTracker · MemberLibrary · Membership · MembershipBanner
    │   ├── AdminConsole · PremiumShield · GoldenSymbols
    │   └── GreekColumns · GoldDust · UtopiaHero        (procedural visuals)
    │
    └── lib/          10 modules — every one has a real importer
        ├── edge-auth.ts      RS256 ID-token verification (Web Crypto + JWKS)
        ├── anon-session.ts   HMAC-signed anonymous quota
        ├── ai.ts             4 providers + 6 philosopher personas + failover
        ├── tiers.ts          tier defs, entitlements, trial maths
        ├── firebase/
        │   └── client.ts       Client SDK bootstrap + offline persistence (lazy singleton)
        ├── session.ts        auth→store bridge, tracker stream, telemetry
        ├── store.ts          Zustand + persist
        ├── tiers.ts          tier defs, entitlements, trial maths
        ├── log.ts            structured JSON logging, PII redaction
        ├── env.ts            zod-validated env with clear errors
        ├── anon-session.ts   HMAC-signed anonymous quota
        ├── edge-auth.ts      RS256 ID-token verification (Web Crypto + JWKS)
        ├── ai.ts             4 providers + 6 philosopher personas + failover
        ├── session.ts        auth→store bridge, tracker stream, telemetry
        ├── store.ts          Zustand + persist
        ├── tiers.ts          tier defs, entitlements, trial maths
        └── firebase.ts       Client SDK bootstrap + offline persistence (legacy, being phased out)
```

**Firestore collections** (`src/lib/firebase/client.ts:74-88` is the single source)
`users/{uid}` · `users/{uid}/{entries,events,puzzles}` · `siteConfig/{library,ads,pricing}` ·
`analyticsEvents` · `analyticsSessions` · `communityPosts` · Storage `premium-library/`

**Storage:** `premium-library/{fileName}` — read = oracle+, write = admin, PDF only.

---

## DECISIONS

### D1 — Authorisation is server-side, from a signed claim
`firestore.rules:13` reads `request.auth.token.admin == true`, not any client-writable field.
`edge-auth.ts` verifies the RS256 signature against Google's JWKS, pins `alg === "RS256"`
(:177, blocks key confusion), and pins issuer **and** audience to the project id (:219-220).
`/api/admin/verify` only *reports*; every mutation is re-gated by rules.
*Supersedes* an earlier client-side `uid === … || true` bypass.

### D2 — The free-tier gate lives on the server, in a signed cookie
`anon-session.ts` — HMAC-SHA256 over `{ used, expiresAt }` in an HttpOnly `miab_anon` cookie,
constant-time compared. A tampered cookie resets to a fresh session; it is never honoured as a
valid one. The rejection branch deliberately does **not** set `Set-Cookie`, since clearing it
would hand out a fresh quota on every refusal.
*Documented honestly*: clearing cookies resets the counter. Conversion device, not anti-abuse.

### D3 — Signup writes a closed document with a server-pinned timestamp
`firestore.rules:37-43` requires exactly `{ email, displayName, subscriptionTier, createdAt,
trialEnd }`, `subscriptionTier == 'free'`, `createdAt == request.time`, and `trialEnd` inside
`[now, now + 14d]`. A client cannot pre-write a tier or an unbounded trial.

### D4 — AI transport is raw `fetch`, no SDK
`ai.ts` — Gemini has its own shape; Groq/NVIDIA/Bytez share an OpenAI-compatible path.
Failover is sequential (`askWithFailover`), metering is charged only on success.
`ai.ts:206` also reads `reasoning_content` when `content` is null.

### D5 — Visuals are code-generated, never stock imagery
`globals.css:227-268` builds the colonnade from gradients (fluting, capital, base);
`GreekColumns.tsx` adds scroll parallax; `GoldDust.tsx` animates motes in CSS only.
`git ls-files` → **zero image assets tracked**.

### D6 — Logical CSS properties for RTL
`start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `border-s` throughout; no `left/right/pl/pr` utility
classes. One deliberate physical `right` inside a style object in `GreekColumns.tsx`, commented.

### D7 — `PremiumShield` is a deterrent, and says so
`PremiumShield.tsx` blocks right-click / copy / cut / drag / Ctrl-C,X,A,S,U,P and print.
Its doc comment states plainly that this is **not** a content-security boundary — no browser
technique stops a screenshot. The real boundary is Firestore/Storage rules.

### D8 — Single Next config, one runtime
`next.config.mjs` is the only Next config; all code under `src/`; manual scripts belong in
`scripts/` (directory created with `check-edge.mjs`).

### D9 — Zod for input validation, jose for JWT
`src/lib/env.ts` uses Zod for env validation with clear error messages.
`jose` is available for JWT operations (currently using hand-rolled RS256 in `edge-auth.ts`,
migration to jose is a future improvement).

### D10 - Testing infrastructure
Vitest for unit tests (42 passing), Playwright for e2e (39 passing).
`scripts/check-edge.mjs` enforces Edge constraints at build time.
e2e runs against a **production build** (`next start`), not `next dev` — strict-mode double
rendering, the dev overlay and unminified chunks all change behaviour, so a green dev run
says little about what users get.

### D11 - Pages are statically prerendered; only API routes declare `runtime = "edge"`
`export const runtime = "edge"` was removed from every **page**. On `@cloudflare/next-on-pages`
the whole app already runs on the edge worker, so the export only disabled static generation
and forced all routes to be server-rendered on demand (`ƒ`). Removing it prerenders 20 of 22
routes (`○`). It is retained on `/api/**/route.ts`, which `scripts/check-edge.mjs` enforces.

### D12 - The Tailwind ramp is bound to theme-aware RGB triplets
`tailwind.config.ts` maps `gold-*` to `rgb(var(--gold) / <alpha-value>)` rather than to a
literal colour. Two reasons: a plain `var(--token)` holding a full colour cannot carry
Tailwind's `/opacity` modifier, and ~55 call sites use one; and because the light theme
re-points the triplets, every existing `text-gold-muted` / `border-gold/20` becomes readable
on parchment with no per-component rewrite. Raw `--bg-*` / `--text-*` values would have
required auditing and editing all of them.

### D13 - Nav and pricing read from a validated config with a synchronous static default
`siteConfig.nav` and `siteConfig.pricing` ship static defaults synchronously (no spinner, no
layout shift) and upgrade to Firestore only when `normaliseNav` / `normalisePricing` validate
the payload. A malformed document degrades to the default rather than throwing. These are
display data, never an authorisation surface — entitlement always comes from the signed
`users/{uid}.subscriptionTier` claim. Prompt 14 makes the documents authoritative; the
validation boundary above is what it depends on.

### D14 - The quotation archive stays empty until it can be sourced
An empty `/quotes` stating its inclusion standard was chosen over shipping hand-typed
classical quotations. Attempts at the latter produced misattributions and corrupted Arabic,
and unverifiable quotes published under this app's name are worse than none.

### D15 - Theme and locale apply pre-paint via inline bootstrap
Both are read from `localStorage` and applied by a synchronous inline `<script>` in `<head>`,
so neither direction nor theme flashes; React then adopts the decision. Fonts are self-hosted
by `next/font` with `display: "swap"`.

### D16 - Content is linted, not eyeballed
Hand-written bilingual copy is easy to corrupt — a Latin fragment lands inside an Arabic
sentence, `tsc` is happy, the build passes, and the page ships visibly wrong.
`scripts/check-content.mjs` fails the build on that, on half-empty bilingual pairs, and on
placeholder leftovers. Its allowlist covers product names and Greek philosophical terms that
legitimately appear in Arabic copy.

### D17 - Admin is a document, not a custom claim
`/api/admin/verify` used to trust an `admin: true` custom claim. A claim is minted when
the token is issued, so deleting the admin document left a usable token for up to an
hour. Admin is now "the document `admins/{uid}` exists", checked on every privileged
request: one Firestore read buys immediate revocation, which is the right trade for an
identity check. The same predicate is used in `firestore.rules` and `storage.rules`,
so client and server cannot disagree about who is an admin.

### D18 - The billing record is server-written and client-invisible
`subscriptions`, `usage`, `grants` and `metrics` are `allow read, write: if false` for
**every** client, admins included. Not "admins may write" - nothing in the browser may
touch them. An admin writing them from the console is a server operation; a compromised
admin session is not. The Admin console, when it exists, must go through an edge route
holding the service account.

### D19 - Entitlement derives from records, and is never stored
`getEntitlements(uid)` reads `subscriptions`, `grants`, the trial window and
`admins/{uid}`, and computes the tier on the fly. Storing the tier on the user document
would give a client a second, stale copy to argue with, and would need invalidating on
every change. `users/{uid}` is not writable for `subscriptionTier` at all, so the old
path can no longer drift into authority.

### D20 - Turnstile fails closed
A missing secret, an unreachable endpoint, or an unparsable response all reject signup.
The alternative - treating "cannot check" as "allow" - would mean the gate protects
nothing whenever Cloudflare has a bad minute. The trade is that an unconfigured
deployment cannot sign anyone up, which is stated in the Firebase Console checklist.

### D21 - Password policy is length only
10 characters minimum, no composition rules, no forced rotation. NIST SP 800-63B advises
against composition rules: they push users toward predictable variants and do not
measurably improve resistance against guessing. Firebase's breach check on account
creation does the work a symbol rule would pretend to do.

### D22 - Failover is allowed only before the first byte
`runChain` pulls the first chunk before it commits to a provider. Once a byte has
reached the client the chain stops trying alternatives, and a later failure becomes a
terminal `error` SSE event. Handing over mid-answer would splice two providers' prose
together, which is worse than a visibly incomplete reply.

### D23 - The time-to-first-token budget guards each attempt, not the whole request
A provider that accepts a request and then stalls is the common failure, so the budget
covers opening the stream *and* receiving the first chunk. A timeout aborts that attempt
only. The chain separately carries a wall-clock budget so a long chain of slow providers
cannot exceed the request deadline.

### D24 - Metering is a server-side atomic counter, and it fires on the first token
The allowance lives in `usage/{uid}` and increments with a Firestore `updateTransforms`
increment, applied atomically by the database. A read-then-write would let two
simultaneous requests both observe 4 and both write 5, granting a sixth free
interaction. It is spent *after* the first token, so a provider outage costs nobody their
allowance. This replaced the signed-cookie counter, which clearing cookies reset.

**Documented limit:** this is a conversion and fair-use measure, not an anti-abuse
system. It stops refreshing, clearing storage, and new private windows. It cannot stop
someone who clears cookies *and* changes IP, because an anonymous visitor has no
server-side identity beyond the record we write. The hashed per-IP ceiling raises the
cost; it does not make bypass impossible.

### D25 - A crisis reply is free, and no provider is contacted
The wellbeing guard runs before identity, quota and provider selection. Someone reaching
out at their worst moment should not wait on a token verification, a Firestore read, or an
upstream that may be down — and must never be shown a paywall for it. The route returns
before spending, and the reply carries `x-quota: not-charged`.

The detector is a deterministic pattern match, not a classifier. It fails in both
directions: it misses indirect phrasings, and it occasionally fires on an academic
discussion of suicide. That is a deliberate trade — an auditable rule cannot fail in a way
that leaves someone alone, and it works with no provider available. It is a backstop, not
a substitute for the prompt-level rule.

### D26 - A persona may only quote from the verified library
`VERIFIED_QUOTES` is deliberately tiny — four well-attested formulations. A persona may
reproduce those verbatim; everything else must be phrased as a reading ("ما يقارب
معنى…"), never as a quotation. `normalisePersonas` rejects the whole admin document if
it references an unverified quote id, so the admin cannot widen what may be attributed to
a historical figure. Aesop has no entries at all: no single line is attested as his own
words, so his persona quotes nothing.

### D27 - Model ids are configuration, not code
No provider adapter contains a model id; each receives one per call. Ids live in
`settings.ts` as shipped defaults, overridable by env and then by `siteConfig.ai`.
Provider catalogues churn and a retired id 404s the whole provider, so a catalogue change
should not require editing adapter code.

Verified against official documentation on **2026-10-03**:

| provider | model | role | source |
|---|---|---|---|
| anthropic | `claude-sonnet-5-5` | chat | platform.claude.com/docs |
| anthropic | `claude-opus-5-5` | analysis | platform.claude.com/docs |
| anthropic | `claude-haiku-4-5` | admin | platform.claude.com/docs |
| gemini | `gemini-3.8-flash` | chat, analysis | ai.google.dev/gemini-api/docs |
| gemini | `gemini-3.5-flash-lite` | admin | ai.google.dev/gemini-api/docs |
| groq | `openai/gpt-oss-120b` | chat, analysis | console.groq.com/docs/models |
| groq | `openai/gpt-oss-20b` | admin | console.groq.com/docs/models |
| nvidia | `nvidia/nemotron-3-super-120b-a12b` | chat | build.nvidia.com/models |
| nvidia | `nvidia/nemotron-3.5-lightning-30b-a3b` | analysis, admin | build.nvidia.com/models |
| bytez | *unset* | — | host unreachable, see ORPHANS |

Rejected: Groq `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` — both
Enterprise-only on the developer plan.

### D28 - One SSE wire format for five providers
Every adapter normalises onto `{ type: "delta" | "done" | "error", … }`. The browser has
one parser, and a mid-stream failure can be reported as a terminal event instead of
tearing down a provider-native protocol. `x-accel-buffering: no` is required: without it
a proxy buffers the response into one delayed blob.

### D29 - Key scanning compares values, not names
`check-edge.mjs` greps for secret *names* in the build output. `check-no-keys.mjs`
greps for secret *values*, which is what catches a key pasted into a component as a
literal — there is no secret name to find in that case.

The `AIza…` prefix is deliberately special-cased: it is shared by the Firebase Web API key
and the Gemini API key, which must be treated oppositely. The Firebase web key is public
by design (it identifies the project; Security Rules and App Check do the protecting), so
an `AIza…` value is a leak **unless** it is byte-identical to the configured
`NEXT_PUBLIC_FIREBASE_API_KEY`. Any other `AIza…` value fails the build.

---

### D30 - A guest's quota key is a cookie the server issues
The allowance is metered per key, and for a visitor with no account that key has to
survive between requests. It is issued as `miab-anon`: an opaque random id,
`HttpOnly`, `Secure`, `SameSite=Lax`, 30 days.

It is deliberately **not** signed. Signing would not help — the value is not an
authorisation token, it is a routing key — and the counter it points at is
server-side, so the counter is the thing that cannot be forged.

This was found the hard way: without it every request arrived with a fresh random key,
each got its own counter starting at zero, and the counter decremented from 4 to 4
forever. The gate could never open, and no test could have caught it by reading the
code — the number was correct, it was just attached to nothing.

Limit, unchanged from D24: clearing the cookie creates a new allowance. The hashed
per-IP daily ceiling (30) is the mitigation, not a fix.

### D31 - The wellbeing guard reads only the latest user turn
An earlier version scanned the last three user turns, reasoning that escalation is
multi-turn. It misfired badly. The disclosure stays in the conversation history
forever, so every unrelated follow-up inside the window was answered with crisis
resources instead of the question that was asked — and because a crisis reply is
deliberately free and unmetered (D25), each of those also **skipped the quota**. Someone
who said one hard sentence could end up with an unlimited, off-meter product that
refused to discuss philosophy.

The guard answers what the user has just said. Real escalation re-appears in the
current turn, because that is what escalation is.

### D32 - The gate belongs to the surface that raised it
`GateDialog` is rendered by `/wisdom`, next to its composer — not by `AppShell`. It used
to be global and driven by the store, which meant any page observing exhaustion could
raise a gate, and a page could show two at once (Playwright found exactly that: a strict
mode violation between the new `GateDialog` and the superseded `GateModal`). A gate is a
decision about one question, so it belongs to the surface that asked the question.

### D33 - The dialogue policy is its own module
How many rounds a visitor gets, and whether the summary is theirs, is a product
decision — so it lives in `src/lib/ai/dialogue-policy.ts` behind functions that take a
single boolean and nothing else. The signature is the guarantee: no value can come from
the request, because there is nowhere to put it.

The summary is members-only. It is the part that makes a debate legible — agreement
named, disagreement named — so serving it free while charging for it would hand over the
whole point of the membership. A guest gets `preview_end`, which is an invitation.

### D34 - Provider base URLs are configuration
`AI_BASE_URL_ANTHROPIC`, `AI_BASE_URL_GEMINI`, `AI_BASE_URL_GROQ`, `AI_BASE_URL_NVIDIA`,
read at call time. Anthropic and Gemini accept https only. This is useful for a
self-hosted or proxied provider, and it is what makes the gateway testable at all — see
D35.

### D35 - The e2e suite runs a real gateway against a fake upstream
Playwright cannot intercept a **server-side** fetch. The providers are called from the
edge route, so `page.route` on `/api/ai` would have replaced the entire gateway — quota,
SSE framing, wellbeing guard, GATE — with a stand-in, and the acceptance criteria would
have proved nothing about any of it.

So `scripts/fake-upstream.mjs` runs as a second web server and the providers are pointed
at it via D34. The real route handles every request; only the model call is simulated.
A test that needs a specific reply shape asks for it with a marker in the prompt, which
the fake recognises — so per-test variation stays out of the app and out of the config.

---

## ORPHANS & PENDING

### What the riddle does NOT ship — stated, not hidden

The brief asked for more than is here. These are the real gaps, not stubs:

1. **Memory-driven riddle selection.** The brief asks for riddles "built on the
   reader's public topics from memory, if enabled". **Not implemented.** The
   philosopher is drawn uniformly. With a fixed pre-written bank, a reader's interests
   cannot shape the riddle itself without either generating text (ungradeable) or
   faking a match (dishonest). Wiring `buildSystemMemorySection()` into the *guidance*
   line is the honest version and is the next step, not a stub here.
2. **The admin screen (brief item 8).** Not built — it was to be wired in prompt 14.
   Until it exists, `siteConfig/riddles` must be edited by hand in the Firebase
   console: `enabled`, `probability`, `prizeDays`, `dailyGrantCeiling`,
   `monthlyGrantCeiling`, `cooldownDays`, `attempts`, `ipDailyRolls`.
3. **The grant log UI.** `riddle/wins/{id}` is written on every prize (uid, riddleId,
   days, attemptsUsed, grantedAt). Nothing reads it yet.
4. **Cluster detection** is account age under 24h, not clustering. See D55.
5. **A single-grant race** can overshoot a ceiling by one. See D54.
6. **No in-UI way to know you won.** A token is inserted client-side and withdrawn
   after 60 seconds. There is no notification, no inbox, and no "you have a token"
   affordance — deliberately, since an indicator that says "you may have won" is the
   first step towards manufacturing excitement.

### ORPHANS — confirmed dead, Phase B deletion candidates

| Path | What | Verdict |
|---|---|---|
| `src/app/god-mode-admin/page.tsx` | `redirect("/admin")` stub; a second URL for one privileged surface | **delete** |
| `src/app/utopia/page.tsx` | `redirect("/wisdom")` stub; superseded | **delete** if no external links |
| `tsconfig.tsbuildinfo` | 94 KB build artifact in root (already gitignored) | **delete** |
| `EDGE_DEPLOYMENT.md` | legacy doc; claims prod metering works — it does not | fold into this file, then **delete** |
| `.env.example` → `FIREBASE_SERVICE_ACCOUNT_JSON` | documented, read nowhere | **remove entry** |
| `.env.example` → `ADMIN_UID` | documented, read nowhere | **remove entry** |

*Not orphans:* all 15 components and all 10 lib modules have real importers. There are **no**
`_build.js` or scratch files, and **no** stock images.

### PENDING — blocked, needs you or manual dashboard work

**Needs you to decide (architecture / money / version)**
1. **Adapter** — `next-on-pages` is deprecated; Cloudflare now recommends vinext (Next 16) or
   OpenNext. vinext conflicts with the Next 14.2.x rule. Full analysis: AUDIT §8.
2. **Bytez** — provider is dead (401 / 404). Remove, or supply a working key + host.
3. **`jose` migration** — `edge-auth.ts` hand-rolls RS256; `jose` is available but not used.

**Needs manual Cloudflare Pages dashboard work (I cannot reach it)**
1. **`NEXT_PUBLIC_FIREBASE_*` unset** → **no auth, no database, no tracker, no admin in
   production.** `/tracker` currently renders "the tracker needs Firebase setup". Set as
   **plain text** for both Production and Preview (they are inlined at *build* time).
2. **`ANON_SESSION_SECRET` unset** → the 5-attempt gate is a no-op in production (7/7 returned 200).
3. **`RIDDLE_SIGNING_SECRET` unset** → `/api/riddle/*` returns 503 and the game does not run. Set a
   distinct ≥32-char secret; the code falls back to `ANON_SESSION_SECRET` but one secret doing two
   jobs should not ship.
4. **`public/_headers` not deployed** → no CSP, no HSTS, no `X-Frame-Options` in production.
5. **Deploy `firestore.rules` / `storage.rules`** — unverified; may not be live. The `riddle/*`
   subtree added for this feature is included in that unverified set.

**Needs building (not Phase B)**
1. **Admin can read raw journal text** (`firestore.rules:32,42`) — violates the privacy rule that
   sensitive data be seen only in aggregate. Needs an entitlement split.
2. **Prompt-injection hardening** in `CORE_DOCTRINE` (`ai.ts:127-138`) — explicit rule, not yet
   implemented.
3. **Zod validation** on `/api/ai` (`api/ai/route.ts:31-40`).
4. **No payment path.** Prices are display-only; `/oracle` and `/sanctum` are unreachable for
   real users. Membership provisioning lives entirely outside this repo.
5. **Fake-scarcity copy** (`tiers.ts:74,97,120`) violates an explicit rule.
6. **`Membership.tsx:59`** — `mailto:membership@mindinbox.app`; confirm the domain is yours.
7. **`jose` migration** in `edge-auth.ts` — hand-rolled RS256 should use `jose`.
8. **`public/_headers` deployment** — needs `pages:build` (requires bash/WSL) or Cloudflare Transform Rules.
9. **`FIREBASE_SERVICE_ACCOUNT_JSON` / `ADMIN_UID`** in `.env.example` — remove entries.

### Recently completed (Phase B)

Infrastructure:
- ✅ Updated Next.js to `14.2.35` (latest safe patch), React `18.3.1`
- ✅ Added `zod`, `jose`, `@dnd-kit/*`, `vitest`, `playwright`, `@typescript-eslint`, `sharp` (dev)
- ✅ `src/lib/env.ts` — Zod-validated env with clear error messages
- ✅ `src/lib/firebase/client.ts` — Lazy singleton, client-only, `persistentLocalCache` + `persistentMultipleTabManager`
- ✅ `src/lib/log.ts` — Structured JSON logging, PII redaction, timing helper
- ✅ `src/lib/edge-auth.ts` — RS256 ID-token verification (Web Crypto + JWKS), JWKS caching
- ✅ `src/lib/anon-session.ts` — HMAC-signed anonymous quota, constant-time compare
- ✅ `src/lib/ai.ts` — 4 providers + 6 philosopher personas + failover (Bytez dead)
- ✅ `.eslintrc.json` — extends `next/core-web-vitals` + `@typescript-eslint`
- ✅ 42 unit tests, 39 e2e tests passing

Design system + shell (design-system brief, then route/shell brief):
- ✅ **Design tokens** in `globals.css`: semantic layer for both themes (dark volcanic + light
  Parchment), gold gradients, glass, shadows/glows, edges, fluid type scale, spacing scale,
  motion durations + easings, and a single z-index ladder. Accent *text* and accent *fill*
  are separate tokens (`--accent` / `--accent-solid`) because the two themes have different
  contrast requirements — sharing one token forces one theme to fail AA. Measured, see below.
- ✅ **Theme-aware Tailwind ramp.** `tailwind.config.ts` now binds the `gold-*` scale to the
  theme-aware RGB triplets (`rgb(var(--gold) / <alpha-value>)`). Triplets rather than colours
  because ~55 call sites use `/opacity` modifiers, which cannot apply to a plain `var()`.
  This is what makes the light theme reachable without rewriting components.
- ✅ **Fonts** via `next/font`: Playfair Display (latin), Amiri (arabic+latin), Cairo
  (arabic+latin), all `display: "swap"`, all self-hosted at build time.
- ✅ **Theme + locale switching** persisted locally, applied pre-paint by an inline bootstrap
  script (no flash). Keyboard: `Ctrl/Cmd+Shift+L` language, `Ctrl/Cmd+Shift+T` theme; both
  suppressed while focus is in a text field so they cannot fire mid-sentence.
- ✅ **Shell**: desktop collapsible glass rail (state persisted, publishes `--rail-w`);
  mobile 5-item bottom bar + "More" sheet with focus trap, Escape, and body-scroll lock.
  No hamburger. Nav read from `siteConfig.nav` via `normaliseNav()` with the static
  `FALLBACK_NAV` shipped synchronously; prompt 14 makes the document authoritative.
- ✅ **All 16 routes** exist and return 200: `/`, `/enter`, `/wisdom`, `/dialogue`, `/journal`,
  `/tracker`, `/paths`, `/quotes`, `/pricing`, `/account`, `/privacy`, `/terms`, `/refund`,
  404, error boundary, `/god-mode-admin` (structure only). `/membership` 307s to `/pricing`
  so old links keep working. `/oracle` and `/sanctum` retained as gated deep pages linked
  from `/paths`.
- ✅ **Landing** is chromeless (`CHROMELESS_ROUTES`): logo, progressively-revealed title
  (per-character, `aria-label` exposes it once), definition, one gold CTA → `/enter`,
  philosophers, three-layer parallax horizon.
- ✅ **Legal drafts** — `/privacy`, `/terms`, `/refund` carry real bilingual drafts. Each
  states in its first line that it is a draft needing legal review. `/privacy` explicitly
  discloses that text is sent to a third-party AI provider, and explicitly admits the admin
  aggregate-only rule is **not yet enforced**.
- ✅ **SEO**: per-page bilingual metadata, `sitemap.ts`, `robots.ts` (blocks admin, account,
  `_design`, `/api/`), JSON-LD on the home page, static `/og.png`. `/account` removed from the
  sitemap — it is `noindex` + disallowed, and listing both is a contradiction.
- ✅ **Pricing** reads `siteConfig.pricing`, three columns, real limits from
  `TIER_DEFINITIONS`. No discounts, no countdown, no seat counters. The legacy
  `scarcity` strings are deliberately unused — we cannot substantiate them.

Verification scripts (all wired into `build:cf`):
- ✅ `scripts/verify-contrast.mjs` — parses the real tokens, computes WCAG luminance.
  **22/22 pairs ≥ 4.5:1 in both themes.** It caught a genuine failure during development
  (light-theme label on gold fill was 3.64:1) that a hand-written comment had claimed passed.
- ✅ `scripts/check-content.mjs` — lints user-visible strings for Latin fragments inside
  Arabic sentences, half-empty bilingual pairs, and placeholder leftovers. Verified by
  injecting a real corruption and confirming it fails.
- ✅ `scripts/make-og.mjs` — generates the static OG image (pure geometry, no text, so no
  Arabic glyph-joining risk). 1200×630, 114 KB.
- ✅ `scripts/process-images.mjs` — image pipeline, verified against a generated
  2400×1350 gold-hairline fixture. See AUDIT for the chroma-subsampling measurement.

### Phase C — identity layer (this pass)

Built:
- ✅ `src/lib/auth/server.ts` — `jose` verification against the securetoken JWKS,
  with `algorithms: ["RS256"]` pinned, `issuer` and `audience` both checked
  against the project id, and a 5s clock tolerance. Module-level JWKS cache;
  Google publishes a long `max-age`, so key refetches are rare.
- ✅ `src/lib/auth/guards.ts` — `requireUser()` and `requireAdmin()`. Every
  failure is a flat 401 (or 403 for a non-admin), always `Cache-Control: no-store`,
  always an Arabic message, never the underlying reason. The verified identity is
  attached as a **non-enumerable symbol**, so it cannot be leaked by spreading the
  request object.
- ✅ `src/lib/google/token.ts` — RS256 service-account JWT via `jose` + Web Crypto,
  exchanged at Google's token endpoint. Secrets read from the environment only,
  never logged, and the assertion is never echoed on failure.
- ✅ `src/lib/google/firestore-rest.ts` — privileged Firestore access over REST.
  Used for the writes the browser must never be trusted with, and to read
  `admins/{uid}` when deciding admin rights.
- ✅ `src/lib/auth/turnstile.ts` — server-side `siteverify`. **Fails closed**: a
  missing secret, an unreachable endpoint, or an unparsable body all reject.
- ✅ `src/lib/auth/client.ts` — sign in/up, Google, guest, verify, reset, change
  password/email, delete. Guest upgrade uses `linkWithCredential`, so the uid —
  and everything stored under `users/{uid}` — survives.
- ✅ `src/lib/auth/errors.ts` — Firebase codes → Arabic. `email-already-in-use`
  deliberately does **not** confirm the address exists; password policy is length
  only (10), no composition rules.
- ✅ `src/lib/entitlements.ts` — `getEntitlements(uid)` reads `subscriptions`,
  `grants`, the trial window and `admins/{uid}`, and derives the tier. Result is
  never stored, so there is no second copy to drift. Prompt 11 feeds it.
- ✅ Data model v1 rules in `firestore.rules`: default-deny, `subscriptions` /
  `usage` / `grants` / `metrics` denied to **every** client including admins,
  cross-user reads impossible, self-promotion impossible. `storage.rules` rewritten
  with a catch-all deny.
- ✅ `/enter` — sign-in/sign-up tabs, email+password, Google, guest; password
  reset and reset-code flows; Turnstile on signup only.
- ✅ `/account` — identity, entitlements, locale, theme, JSON export, and
  deletion in the only safe order (Firestore first, then the Auth account).

Tests:
- ✅ 62 unit tests, including 12 new ones: **expired, wrong-audience,
  wrong-issuer, `alg:none`, foreign-key-signed, and malformed tokens are all
  rejected**, verified with real RS256 signatures rather than mocks.
- ✅ Guard tests: every rejection is 401 with `no-store` and an Arabic message,
  and the reason never leaks the underlying library.
- ❌ **`npm run test:rules` could not be executed here** — no JRE on this machine,
  so `firebase emulators:exec` fails with `Could not spawn java -version`. The
  tests are written and wired; they are unverified. Install a JRE and run them.

### Phase D — AI core (this pass)

Built:
- ✅ `src/lib/ai/providers/` — one adapter per provider, pure `fetch`, no SDK:
  `anthropic.ts`, `gemini.ts`, and `openai-compatible.ts` shared by Groq / NVIDIA /
  Bytez. Each normalises its wire format (Anthropic's `x-api-key` + `system` field +
  typed events; Gemini's `:streamGenerateContent?alt=sse` + `model` role + `x-goog-api-key`;
  OpenAI's `delta.content`) onto one shape. No adapter holds a model id.
- ✅ `src/lib/ai/settings.ts` — model ids, per-role chains, timeouts and breaker
  settings, overridable by env then by `siteConfig.ai`. Remote overrides are clamped,
  and an unknown provider id is dropped rather than trusted.
- ✅ `src/lib/ai/chain.ts` + `breaker.ts` — role-based failover, 12s time-to-first-token
  budget, one retry per provider, per-provider circuit breaker, wall-clock budget.
  Failover stops the instant the first byte is out.
- ✅ `src/lib/ai/sse.ts` — unified SSE framing, UTF-8-safe incremental line reader,
  `[DONE]` sentinel, and a `done`/`error` terminal contract.
- ✅ `src/lib/ai/safety/wellbeing.ts` — crisis detection, warm reply, real crisis lines.
  Runs before identity, quota and providers; never counted; never shows the paywall.
- ✅ `src/lib/ai/safety/injection.ts` — user text is fenced as data, the system prompt
  is never revealed, fence-escaping is neutralised, and a client-supplied `system` turn
  is dropped.
- ✅ `src/lib/ai/personas.ts` — Plato, Rumi, Dostoevsky, Aesop as admin-validatable
  data, with a 4-entry verified quotation library and an AI disclosure in every prompt.
- ✅ `src/lib/ai/prompts.ts` — non-negotiable rules separated from the editable persona
  brief, so an admin cannot promote a style note above a safety rule by wording it
  imperatively.
- ✅ `src/lib/quota.ts` — per-uid allowance, atomic Firestore increment, hashed per-IP
  daily ceiling, spent on first token.
- ✅ `src/lib/metrics.ts` — `metrics/{day}` aggregates. No conversation text, ever.
- ✅ `/api/ai` rewritten: SSE, abort on client disconnect, output cap, `{code:'GATE'}`.
- ✅ `scripts/check-no-keys.mjs` — value-level key scanning, wired into `build:cf`.

Tests — 115 passing, 53 of them new:
- ✅ `chain.test.ts` (11) — the acceptance criteria. First provider refusing, stalling
  or returning empty moves to the second **before the first byte**; a provider that dies
  **after** streaming raises rather than silently handing over, and the fallback is
  never contacted; retry happens once; the breaker opens and skips; cancellation
  propagates.
- ✅ `quota.test.ts` (6) — 5 allowed, 6th returns GATE; wiping every browser-side store
  does not restore the allowance; five concurrent spends yield exactly 5 (atomicity);
  the per-IP ceiling gates a fresh uid; the raw IP is never stored; the hash differs by day.
- ✅ `safety.test.ts` (15) — crisis detection in both scripts, no false positive on
  ordinary philosophical conversation, no persona in a crisis reply, injection
  neutralised, fence cannot be closed early, client `system` turns dropped.
- ✅ `personas.test.ts` (21) — the four personas, quote ids all resolvable, the admin
  cannot widen the library, prompt contains the AI disclosure and the no-diagnosis rule,
  settings precedence and clamping.
- ✅ `check:keys` verified by injection: two realistic keys placed in the client bundle
  were caught, and removing them returned it to passing.

### Phase D — what is NOT done
- ❌ **The providers were never called against the live APIs.** Model ids are verified
  from documentation and the adapters follow the documented wire formats, but no test
  exercises a real endpoint. First live request may need shape corrections.
- ❌ **No TTFT measurement against real providers.** The 12s budget is a reasoned
  default, not a measured p50/p99. It should be tuned once real latency is known.
- ❌ **The crisis detector is a pattern list, not a classifier.** Documented in D25. It
  will miss indirect phrasings; that gap needs a real solution (a classifier model, or
  a human escalation path) rather than more regexes.
- ❌ **`getEntitlements` still has nothing to read.** No payment path, so
  `subscriptions/{uid}` is empty and everyone is `free`/`trial`.
- ❌ **Quota fails OPEN when the counter store is unreachable.** Chosen so a Firestore
  blip does not deny every user, but it means an outage removes the limit. Documented
  in `quota.ts`; worth revisiting with a circuit breaker of its own.
- ❌ **Prompt-11 remains absent**, so the `analysis` role has no distinct caller yet.
 
- ❌ **Rules tests unverified** (above). This is the one acceptance criterion of
  this pass that has no evidence behind it yet.
- ❌ `/oracle`, `/sanctum` and the community posts still read entitlements from a
  custom claim and from `users/{uid}.subscriptionTier`, not from
  `getEntitlements(uid)`. Migrating them is the natural next step; the rules now
      permit the subscription-based read, so nothing blocks it.
- ❌ No payment path, so `subscriptions/{uid}` is always empty and every user
      resolves to `free` or `trial`. `getEntitlements` is built for prompt 11 and
      currently has nothing to read.
- ❌ `grants` is listed rather than queried by field, so the read is O(all grants)
      up to 20 documents. Fine at current scale; needs an index or a
      `grants/{uid}` shape later.
- ❌ Rate limiting on `/api/auth/turnstile` is left to Cloudflare (documented in
      PROJECT_MAP) rather than implemented.

- ❌ **`assets-source/` is empty.** The image pipeline is written and verified but has no
  source art, so `public/art/` is empty and the `ArtLayer` / canvas `GoldDust` background
  engine from the design-system brief is **not built**. Needs the artwork from you.
- ❌ **Light theme is partial.** Tokens, glass, buttons, body and the Tailwind ramp are all
  theme-aware and verified for contrast, but components that hardcode `bg-black/*`,
  `text-white/*` or raw hex still render dark-mode-only. Needs a sweep.
- ❌ **Lighthouse performance not measured.** A11y 100 / SEO 100 / best-practices 100 were
  measured on the home page; the tool used does not return a performance score, and the
  brief asks for a *mobile-throttled* run. Run `npx lighthouse --preset=perf` under mobile
  throttling before trusting the ≥90 target.
- ❌ **`/quotes` ships an honest empty state**, not quotations. Hand-typed classical
  quotations were attempted and came out with misattributions and corrupted Arabic, so the
  file was deleted rather than shipped. Populating it needs a source-verified dataset.
- ❌ **`/account` and `/god-mode-admin` are structure only**, as the brief specified.
- ❌ `pages:build` still cannot run on Windows (`spawn bash ENOENT`); `build:cf` fails at its
  last step for that reason only. Needs WSL, Linux, or CI.

---

## Prompt 06 + 09 surfaces — what this pass built

### `/wisdom` (prompt 06 §1–6)

| Requirement | Where | Evidence |
|---|---|---|
| Philosopher chosen from elegant cards (name, style line, mark) | `PersonaCards.tsx`, `PERSONA.symbol` | 4 `role=radio` cards, one `aria-checked` |
| Choice saved **per conversation**, not globally | `conversations.ts` — `Conversation.personaId` | e2e: stored `personaId` is the card clicked |
| Streamed reply | `WisdomChat.tsx` → `stream-client.ts` | e2e against the real gateway |
| `dir="auto"` per message | every bubble and the composer | e2e asserts the attribute |
| Light markdown, no raw HTML | `markdown.ts`, `Markdown.tsx` | 16 unit tests + e2e: a `<script>` in the reply renders as visible text and never executes |
| Copy / regenerate / save to journal / make quote card | `MessageActions` | e2e asserts all four exist |
| History in Firestore, local-first, rename, delete | `conversations.ts` | local-first is what carries a guest's work across sign-up |
| Quiet meter ("بقي لك 3 أسئلة مجانية") | `QuotaMeter.tsx` | silent while the allowance is untouched; no bar, no countdown |
| GATE: gate image, sincere copy, 14-day trial stated as a fact, equal "later" | `GateDialog.tsx`, `public/gate.png` | e2e: trial length present, no pressure vocabulary, "later" dismisses without navigating |
| Gate **never** for a crisis reply | guard runs before metering | e2e: crisis then 5 answers then refusal — proof by exhaustion |
| Three fixed opening questions, loading, error, offline | `WisdomChat.tsx` | e2e asserts exactly 3 |
| Composer fixed above the keyboard, smooth scroll | `sticky bottom-0`, `scrollIntoView` only when already near the end | 360px e2e: composer inside the viewport, no horizontal scroll |

`make quote card` links to `/quotes` and labels itself "(قريباً)". That is honest:
`/quotes` is an empty state with a stated inclusion standard, because the
quotation dataset does not exist yet (see ORPHANS). The button does not pretend
to produce a card.

### `/dialogue` (prompt 06 §7–8)

| Requirement | Where | Evidence |
|---|---|---|
| Question + two philosophers | `Dialogue.tsx` | two slots, refusing the same persona twice |
| Three rounds, sequentially generated | `api/dialogue/route.ts` | B is generated only after A's turn exists |
| Neutral summary naming agreement and disagreement | `dialogue-prompts.ts` | asks for both explicitly; forbids adjudicating |
| One interjection sentence between rounds | `Dialogue.tsx` → `transcript` as "القارئ" | — |
| Non-member: one round, then a quiet invitation | `dialogue-policy.ts` | e2e: rounds 2 **and** 3 return `preview_end` with no turns |
| **The server decides** | entitlement in the route, never a client flag | e2e calls the API directly as a crafted client |

Sequential generation costs latency and is not negotiable: the second speaker has to
react to what the first just said. Two parallel calls produce two people talking past
each other, which is not a dialogue.

### Verification

```
check:edge      ✅   check:contrast 22/22   check:content ✅   check:keys ✅
typecheck       ✅   lint no errors         build ✅
unit            164 passing (14 files)
e2e              66 passing (39 shell + 15 wisdom + 12 dialogue)
```

### What is still unverified

- ❌ **The member path of `/dialogue` has no test.** There is no auth emulator (no JRE)
  and no service account, so no test can hold an entitled identity. Rather than stub the
  entitlement — which would only test the stub — the round count is asserted where it
  lives, in `dialogue-policy.test.ts`, and e2e asserts only that a guest cannot reach it.
  **Three rounds and a summary are therefore unproven end to end.**
- ❌ **The quota's in-memory fallback engages locally**, so the 5-then-GATE evidence comes
  from a per-isolate counter. The Firestore-backed path (D24) is still unexercised, for
  the same missing-credentials reason. Note the fallback is guarded on **credential
  availability, not `NODE_ENV`** — `next start` runs with `NODE_ENV=production`, so an
  environment-based guard switches it off in exactly the local production build the e2e
  suite exercises.
- ❌ **No live provider call has been made.** The documented wire formats come from each
  provider's official docs (verified 2026-10-03), not from a real response.
- ❌ Firestore/Storage rules tests (no JRE), `pages:build` (no bash) — unchanged from above.
- ❌ The dialogue client sends a whole round as one `turn_delta` rather than token by
  token. The server buffers it deliberately — a half-turn attributed to a real philosopher
  is worse than waiting — so the *client* is exercised only against that buffered shape.
  The SSE reader's incremental and split-frame paths are covered by unit tests instead.

### New files this pass

| Path | Purpose |
|---|---|
| `src/lib/markdown.ts` + `.test.ts` | markdown subset → typed AST; no node can carry markup |
| `src/components/Markdown.tsx` | renders the AST; no `dangerouslySetInnerHTML`, by construction |
| `src/lib/conversations.ts` | local-first conversation store, Firestore sync, rename, delete |
| `src/components/WisdomChat.tsx` | `/wisdom` |
| `src/components/PersonaCards.tsx` | philosopher cards |
| `src/components/QuotaMeter.tsx` | the quiet meter |
| `src/components/GateDialog.tsx` | the gate (replaces `GateModal.tsx`, deleted) |
| `src/lib/stream-client.ts` | chat SSE reader |
| `src/app/api/dialogue/route.ts` | the dialogue gateway |
| `src/lib/ai/dialogue-types.ts` | its wire format |
| `src/lib/ai/dialogue-prompts.ts` + `.test.ts` | turn and summary prompts |
| `src/lib/ai/dialogue-policy.ts` + `.test.ts` | who gets how many rounds |
| `src/lib/ai/http.ts` | shared SSE plumbing |
| `src/lib/http.ts` | shared `clientIp` |
| `src/lib/dialogue-client.ts` + `.test.ts` | dialogue SSE reader |
| `src/components/Dialogue.tsx` | `/dialogue` |
| `scripts/make-gate.mjs` | `public/gate.png` — pure geometry, no text |
| `scripts/fake-upstream.mjs` | the deterministic upstream for e2e |
| `e2e/wisdom.spec.ts`, `e2e/dialogue.spec.ts` | 27 acceptance tests |

### Deleted this pass

`src/components/WisdomHub.tsx` (superseded by `WisdomChat`), `src/components/GateModal.tsx`
(superseded by `GateDialog`, and a second gate could appear at once — D32).

---

### D36 - Journal AI consent is one switch, checked before any read

`users/{uid}/settings.aiJournalConsent` is the only thing that permits the server to
read a reader's journal or their mood. It defaults to `false`, it is checked in
`ai-consent.ts` **before a read is issued**, and `readJournalForAi` is the only
function in the codebase allowed to read a day document for the Oracle's benefit.

The ordering is the whole point: a filter applied *after* the read still reads the
journal, and on a server the read is the disclosure. So the test asserts
`expect(read).not.toHaveBeenCalled()` — not "the right error came back". A post-hoc
filter passes the first kind of test and fails this one.

Three consequences, all deliberate:

- **Mood is behind that switch, and only that switch.** It is not bundled with
  analytics or "personalisation". The UI hides the mood row entirely while consent
  is off, and says so at the point where it would otherwise have asked.
- **Revoking consent does not delete anything.** The reader's own mood rating is
  theirs; withdrawing permission to *read* it must not destroy it. Verified: mood 5
  survives the switch going back off, and the field disappears.
- **Turning it *on* asks once.** It is the irreversible-feeling half, so it gets a
  plain confirmation naming what will become readable.

The predicate is `=== true`, not truthiness. A corrupt value, the string `"false"`,
or a document from a future schema all refuse — consent that cannot be positively
identified is not consent.

### D37 - A day key is a calendar date, never an instant

Day keys are `yyyy-mm-dd` in the reader's own stored timezone. There is no
`+86_400_000` anywhere in `day-key.ts`, and adding one is the bug the module exists to
prevent: a year contains one 23-hour day and one 25-hour day in Europe/London, so
instant arithmetic drifts by an hour twice a year and eventually files an entry under
the wrong day. Every day-key operation is calendar arithmetic on the string, which is
structurally immune. DST and midnight are both covered by tests.

A reader in Asia/Riyadh writing at 01:00 local is writing on their Tuesday. If the
key came from UTC it would be Monday, and the entry would land in the wrong streak.

### D38 - Absence is not zero, everywhere in the journal

A day with no entry is *missing*, not *zero*. Enforced across the whole layer:

| Situation | Rendered as |
|---|---|
| Energy not rated | `null` — no bar at all, a dashed outline instead |
| A gap in a trend line | the line breaks; it is not drawn through zero |
| Mood not recorded | the row is absent |
| A virtue rated on two days | "you have two days" — the radar refuses to draw a shape |
| Energy identical every day | `r` is `null`, not `0` |

The last one matters most: `r = 0` is the claim "these are unrelated", where the truth
is "there is nothing here to compare". And a habit–energy view that drew a fitted line
through scattered points would imply a relationship the data cannot support, so there
is no fitted line — only the scatter, and a caption that says the same thing in words.

---

## Prompt 08 — the journal

### What was built

| Area | Where | Notes |
|---|---|---|
| Day keys, timezone, DST, midnight | `src/lib/journal/day-key.ts` | D37; 31 tests |
| Streaks with one grace day | `src/lib/journal/streaks.ts` | 28 tests |
| Consent gate | `src/lib/journal/ai-consent.ts` | D36; 15 tests |
| Aggregation for every chart | `src/lib/journal/aggregate.ts` | D38; 22 tests |
| JSON + CSV export | `src/lib/journal/export.ts` | 20 tests |
| Offline-first store + sync queue | `src/lib/journal/store.ts` | — |
| Data model v1 | `src/lib/journal/types.ts` | — |
| SVG charts, no library | `src/components/journal/Charts.tsx` | day/week/heatmap/trend/radar/scatter |
| The page | `src/components/journal/JournalApp.tsx` | — |
| The consent switch | `src/components/journal/AiConsentSwitch.tsx` | — |

**121 journal unit tests**, 285 total.

### Acceptance criteria, honestly

| Criterion | Status |
|---|---|
| Chain and timezone logic (DST, midnight) | ✅ **proven.** 31 day-key + 28 streak tests, including the 23-hour and 25-hour London days and a post-midnight write in Riyadh |
| AI key off prevents any server read of journal content | ✅ **proven.** The reader is injected and asserted never called — not merely that the right error returned |
| 1000 entries does not slow the screen | ⚠ **measured, partially.** 380 days × 3 journal entries (≈1140 entries) seeded: habit tick 32 ms, year view 64 ms, 481 DOM nodes. Measured in a real browser, not asserted in CI, and not on a mid-range phone |
| Offline work then sync (e2e) | ❌ **not done.** The local-first write path and the queue are built and verified in-browser (entry persists with no network), but there is no e2e that goes offline, writes, comes back, and asserts the Firestore write. No auth emulator exists (no JRE) |

### What is deliberately absent, and why

- **No Oracle endpoint.** The consent gate is built and tested, but nothing calls it
  yet — the weekly summary and the mental report need `/api/oracle/*`, which is not
  written. The gate is the hard part; the route is not.
- **No PDF export.** The canvas→PDF pipeline belongs to prompt 09, which is not
  built. The mental report can be exported as JSON/CSV today; the PDF is not faked
  with a print stylesheet and called done.
- **`firestore.rules` does not cover `users/{uid}/days`, `habits`, `principles` or
  `settings`.** They are written to by the client SDK, so until the rules are
  extended **the journal is not actually private** — a reader could not open another
  reader's day. This is the most urgent gap in this pass and it is a security gap,
  not a feature gap.

  ✅ **Resolved in this pass.** The four journal collections now have the strictest
  rules in the file, with **no `isAdmin()` anywhere in them**. The day rule had to
  change substantially for the new model, and three points are worth knowing:

  - `date == request.time.substr(0, 10)` is **removed**. It forced UTC day keys,
    which contradicts the reader's own timezone (D37) and would have filed every
    entry of a reader east of Greenwich under the previous day. Replaced with a
    shape check plus a bound: no future dates, not before the current month.
  - `updatedAt == request.time` is **removed** and replaced with a bounded client
    timestamp (within a day of now). The journal is written offline and must not
    wait for a round-trip, so the client's clock is trusted — but bounded, so a
    client cannot backdate to win a merge or set a far-future stamp.
  - `isAdmin()` was removed from `days` read. It was there, and it contradicted the
    standing "admins see aggregates, never content" rule for the one collection
    where it matters most.

  ⚠ **These rules are unverified.** `npm run test:rules` needs a JRE, which this
  machine does not have. The syntax has not been checked by the emulator. The
  journal-rules test file needs assertions for: a reader cannot read another's day;
  an admin cannot read any day; a future-dated key is refused; an out-of-window
  `updatedAt` is refused; a closed key set is enforced on every nested map; and
  `grace > 3` is refused.
- **Free limits are enforced in the store only** (`addHabit` refuses at 3). The
  server does not yet check `habitsLimit` or `historyDaysLimit`, so the limit is a
  courtesy rather than a control. `getEntitlements` is not yet consulted for this page.
- **The 30-day free history limit is not applied.** Days are read from local storage
  without a cut-off.
- **Day keys are not re-derived on a timezone change.** `rekeyDays` records the new
  zone and keeps the calendar dates, which is the honest option (a whole-day document
  has no instant to re-derive from) but it means a reader who moves timezone sees the
  same calendar dates rather than their true local days.
- **The old `/tracker` and `Journal` components are still on disk** and still import
  the previous single-collection model. `/journal` no longer uses `Journal.tsx`;
  `/tracker` still renders `DailyTracker.tsx` with its own, older streak logic that
  knows nothing about grace days. **Two sources of truth for streaks exist right now.**

---

### D39 - "Verified" means the wording was read in the cited edition

The brief asks for `verified: true` and for every quote to be checked against its
source before it is marked. That is ambiguous, so it is pinned here:

> **`verified: true` means the wording in `sourceText` was read in the cited edition,
> named in `translator` and `edition`.**

Not "widely attributed". Not "I know the gist". This is a narrower bar than "the
author wrote this", deliberately: a translation is an interpretation, and a reader
comparing the Arabic against the English must be able to find the same sentence.

Three consequences:

- **`sourceText` is stored next to `textAr`.** This is the safeguard against a
  *semantically* wrong Arabic rendering, which no lint can catch. `check:content`
  catches Latin fragments; it cannot tell you that a rendering has drifted from its
  source. Storing both makes the drift visible, and `/quotes` shows the original
  under a disclosure so any reader can do the comparison.
- **Translation is recorded, never implied.** Every entry is an Arabic rendering of
  another language, so `translator` and `edition` are required whenever
  `language !== "ar"`. Presenting our own words as a published translator's is the
  same error as a misattribution, one step removed.
- **The gate is in the accessor.** `verifiedQuote()` returns `null` for unknown *and*
  unverified ids, and it is the only sanctioned way to reach a quotation. A page-level
  filter is one refactor from being dropped; an accessor is not.

### D40 - Cards are drawn in a canvas because shaping is the hard part

The brief requires canvas rendering and `pdf-lib` embedding rather than server-side
PDF generation. The reason is worth recording: **embedding an Arabic font in a PDF
means trusting the reader's PDF viewer to shape correctly**, and that varies. Drawing
once in the browser's own text engine and embedding the resulting pixels means every
reader sees exactly the card we drew, with no font shipped and no viewer dependency.

Two things break Arabic on a canvas, and both are handled:

1. **Direction.** `ctx.direction = "rtl"` must be set, or the run is laid out
   left-to-right and trailing punctuation lands on the wrong edge.
2. **Shaping.** Letters have contextual forms, and a canvas shapes them only when the
   string is passed whole. `wrapArabic` therefore breaks **between words only** — a
   mid-word break splits a contextual form from its neighbour and produces a
   disconnected letter, which is precisely the artefact the visual test hunts.

The joining is proven, not asserted. The test measures a whole Arabic string and then
measures each character alone and adds them up: because initial and medial forms are
*narrower* than the isolated form, real shaping makes the whole string measurably
narrower than the sum of its parts. Measured ratio on the shipped quotes is **0.78**;
an unshaped canvas would sit at ~1.0.

---

## Prompt 09 — quotes: what was verified, and what was refused

### The library

**11 verified quotes** from three primary sources, all read in full in the cited
public-domain edition:

| Work | Edition | Quotes |
|---|---|---|
| Plato, *Apology* | tr. Benjamin Jowett (1871), MIT Classics | 5 |
| Plato, *Republic* Book VI | tr. Benjamin Jowett (1871), MIT Classics | 3 |
| Marcus Aurelius, *Meditations* | tr. Meric Casaubon (1634), Gutenberg #2680 | 3 |

Every entry carries work, locator (Stephanus page or book+section), translator,
edition, and a `sourceUrl` the reader can open. The card renders the attribution and
source unconditionally — there is no template that omits it and no flag that hides it.

### Quotes considered and refused

The brief allows up to sixty. Eleven is deliberate, and these are the ones that were
examined and **not** included:

| Refused | Why |
|---|---|
| **"I did not know that I did not know"** — the world's most famous "Socrates quote" | **A misattribution.** This exact sentence does not appear in Plato. The text at *Apology* 117a is `οὐκ οἶδα οὐδ᾽ ὡς οἶδα` — "I neither know nor think that I know." The famous English is a later paraphrase. The library ships the real text and the rejected form is recorded here. |
| **"لم تعرف شكله" / "the Allegory of the Cave" as a quotable line** | *Republic* VI was read and contains no such sentence. The cave is Book VII, which was **not** fetched this session. Not included rather than paraphrased from memory. |
| **"العائق في الطريق يصير هو الطريق" (Meditations V.20)** | Removed. The Jowett/Casaubon texts available here were not fetched at that passage, and the Arabic rendering previously in the codebase ("يقدّم نفسه، وهو ليس ضدك") **dropped the claim** — the sentence says the obstacle *becomes the path*, not that it is harmless. Wrong meaning dressed as a translation. |
| **Rumi, "الماء لا يخرج من الماء"** | Attributed to the *Divan-e Shams*, but the line circulates in many near-identical forms with **no consensus line number**. Without a locator it is not citable by this project's own standard. Removed. |
| **"The unexamined life is not worth living" as a free-standing aphorism** | Kept, but only with its Stephanus locator and its translator. It is often rendered as "The unexamined life is not worth living" — a modern compression. The library ships Jowett's actual phrasing. |
| All Rumi, Ibn Arabi, Attar, Kierkegaard, Nietzsche, Camus, Sartre, Heidegger, Confucius, Aristotle | **No edition was fetched and read this session.** Nothing in memory was promoted to `verified`. Adding them requires the same treatment: read the edition, store the wording, record the locator. |

This list is the deliverable as much as the library is. A credibility product that
cannot say what it refused is not demonstrating credibility.

### The gate

`/api/quotes/card` decides server-side from the verified token. Proven by e2e:

- anonymous request → `entitled: false`, `watermark` set
- **forged** `Authorization: Bearer …` → still `entitled: false`, still watermarked
- unknown or unverified `quoteId` → **404**, not a watermarked card
- entitlements unreachable → **fails closed** (watermark applied, error logged). Failing
  open would hand out an unwatermarked card, which is the one outcome the gate exists
  to prevent.

The preview text is deliberately **not** blanked. Withholding the words and calling it
a paywall would be dishonest about what the product is: the reader sees the card,
watermarked, and is told plainly what membership changes.

### Acceptance criteria

| Criterion | Status |
|---|---|
| Every visible quote has a specific source | ✅ 13 e2e tests; each card asserted for work, locator and translator, and cross-checked against the server |
| Visual test on 5 Arabic cards proves joining and direction | ✅ **proven by measurement.** Whole-string vs summed-character width across 5 live quotes, ratio 0.78; `ctx.direction === "rtl"` asserted |
| PDF under 1 MB | ❌ **not applicable yet** — `pdf-lib` assembly is not built. The card is PNG at 1080×1350 with flat colour, which compresses to roughly 150–400 KB; five of them plus a small wrapper would fit. That is an estimate, not a measurement. |
| Download refused server-side, not just UI | ✅ four e2e tests, including a forged token |

### What is not built

- **No PDF.** `pdf-lib` is not installed and the assembly step does not exist. The
  card renders to a PNG blob and downloads as `.png`. The `< 1 MB` criterion is
  therefore untested.
- **Favourites are session-only** (`useState`), not persisted. They vanish on reload.
- **"Quote of the day" ignores interests.** `pickQuoteOfTheDay` accepts an interests
  parameter and narrows by topic, but nothing passes it: the paths feature stores
  progress, not declared interests. The brief's "if available" is honoured by the
  signature rather than faked at the call site.
- **No `/quotes` SSR of the original text** beyond a `<details>` disclosure.

---

### D41 - Two consent switches, never one

`users/{uid}/consent` holds two independent booleans:

| Switch | Covers | Default |
|---|---|---|
| `conversation` | philosopher chosen, question topic, lesson finished, habit ticked | **false** |
| `journal` | reflective journal and mood | **false** |

Bundling them would mean a reader happy to have their lesson progress remembered
must also consent to their mood being read. That is not consent, it is a bundle.
Both are off by default, which is the only defensible default for a product that
starts collecting on day one.

`decideSignal()` evaluates in a fixed order — global switch, pause, identity, then
the switch — and **fails closed**. An unreadable consent document means no signals.
Treating it as permission would mean a Firestore blip silently turns a refusing
reader into a tracked one.

### D42 - The receiver ignores the client's claim about who it is

`/api/signals` reads the uid from the **verified token**, never from the request
body. The body carries one so the client can tell whether its own view is
identified, but a forged uid in the body would otherwise let one reader write
aggregates into another's account. `e2e/signals.spec.ts` posts a victim's uid with a
forged bearer token and asserts `accepted: 0`.

### D43 - Aggregates, not a log

Incoming events fold into `users/{uid}/signals/{yyyy-mm}` as
`kind:value → count` and are then discarded. Twelve months, rolling, pruned as the
newest arrives (`retention.ts`).

A log would be a liability: retained, secured, deleted on request, argued about in
a privacy policy. A tally supports every feature the aggregates exist for —
recurring topics, reading rhythm — while holding nothing that reconstructs a session.

### D44 - The golden rule is enforced by construction, and the rule names itself

`buildSystemMemorySection()` is the only sanctioned way to put a profile into a
prompt. The constraint is `GOLDEN_RULE_AR`, a **separate export**, because it
necessarily names the phrases it forbids: if it were inline in the output, scanning
that output for surveillance language would find the rule quoting the phrase it
prohibits. That is not hypothetical — the red-team test failed on exactly this until
the rule was lifted out.

`breaksGoldenRule()` checks the content only, before the heading, and is blunt on
purpose: it over-flags. A false positive costs a rewrite; a false negative tells a
reader the product is watching them.

### D45 - Sensitive attributes are refused by regex, and the regexes were wrong twice

`scrubGoals()` keeps only statements that are **goals** rather than **disclosures**:
a volunteered aim is permitted, a volunteered symptom is not. The line is drawn
there deliberately — a missed goal costs a slightly less personal suggestion, a
stored symptom is a disclosure nobody consented to in that form.

Two bugs were found by the tests and are worth recording because both looked like
working code:

1. **`لا?` is not an optional group.** The intended `/لا?\s*أؤمن/` requires the
   letter "ل" and can never match a bare "أؤمن", so the entire religion alternative
   was dead code and every declaration of belief passed through the scrubber.
2. **`\b` does not work after Arabic letters.** It is defined over ASCII word
   characters, so `أؤمن\b` requires a boundary that never occurs. Replaced with an
   explicit `(?![؀-ۿ])` lookahead.

A guard that looks like it is guarding something and is not is the worst kind of
bug — the test is the only reason it gets noticed.

---

## The golden token riddle

### What was built

| Area | Where |
|---|---|
| Settings, hard-clamped on read and on write | `src/lib/riddle/settings.ts` |
| The draw — CSPRNG, ceilings first, randomness as a parameter | `src/lib/riddle/roll.ts` |
| The win token — HS256, 10 min, uid- and philosopher-bound | `src/lib/riddle/token.ts` |
| The riddle bank and its acceptance lists — **server only** | `src/lib/riddle/bank.ts` |
| The fixed criterion | `src/lib/riddle/verify.ts` |
| Cooldown, budget, single-use tokens, HMAC-hashed IP | `src/lib/riddle/store.ts` |
| The roll | `src/app/api/riddle/roll/route.ts` |
| Redemption — Turnstile, spend, return the prompt | `src/app/api/riddle/open/route.ts` |
| Grading and the prize | `src/app/api/riddle/answer/route.ts` |
| The token, inserted by script only | `src/components/riddle/GoldenToken.tsx` |
| The session — roll, challenge, riddle, verdict | `src/components/riddle/RiddleSession.tsx` |
| The build gate | `scripts/check-no-riddle-leak.mjs` |

**48 unit tests** in `riddle.test.ts`, **13 e2e** in `e2e/riddle.spec.ts`.

### D46 - The probability is never a number the client has

There is no `GET /api/riddle/config`, and there will not be one. `rollOutcome` reads
its randomness from `crypto.getRandomValues` internally and takes only *context* as an
argument, so a caller cannot pass a `Math.random`. The chance is read from
`siteConfig/riddles` in the route and never returned; `/roll` answers a win with a
token or a loss with `{"won": false}` and nothing else.

Every refusal — cooldown, IP limit, new account, both ceilings — returns the **same**
body. A prober who learns the reason was `daily_ceiling` learns the budget is nearly
spent, and one who learns it was `ip_limit` learns to wait. The real reason goes to
the server log only.

### D47 - A ceiling is evaluated before the draw, not after

The order inside `rollOutcome` is budget → cooldown → soft barriers → draw. This is
what makes "exceeding the ceiling stops granting immediately" true rather than
approximately true: a reader cannot win, be refused, and be told they won. It is
asserted directly — `draws === 0` after a refusal — because a test that rolled until
it saw a win would prove nothing.

### D48 - The random source is a parameter, so a distribution can be tested at all

`rollOutcome(context, random = cryptoRandom())`. Production passes a CSPRNG reader;
the distribution test passes a seeded mulberry32 and asserts the shape over 200,000
draws. This is the only way to test a probability at all: a test that rolls 100 times
with real entropy and expects roughly 4 wins fails about a third of the time.

The philosopher and the riddle number are drawn **independently**. One draw for both
would correlate "won" with riddle 1, because a small value always lands on the first
philosopher.

### D49 - Acceptance is phrase-level, and the first bank was wrong sixteen times

The bank originally accepted single words. Two riddles leaked their own answers, and a
test over all 9×9 pairs found **sixteen leaks**: a prompt written from a resolution
reuses its vocabulary, so "قال رجل: لم أعرف أني لا أعرف" contained one of its own
required answers.

Single words are also satisfied by a guess — requiring "أثر" requires no
understanding, only the right noun. Every required idea is now a phrase the reader
must *argue* ("الأثر ينطبع في النفس"), which no phrasing of the question can contain.

The cost is stated, not hidden: a reader who understood the idea and phrased it
differently is refused. That is the price of a fixed criterion, and the forbidden list
is what stops it from being abusable.

### D50 - The token carries the philosopher, and the bank validates it

`verifyWinToken` takes `knownPhilosophers` and refuses a token naming anyone absent.
The list is derived from the bank, so the two cannot disagree.

This exists because the bank was written against `aurelius` — three riddles, good
prose, **no such persona anywhere in the app**. The real set is `plato`, `rumi`,
`dostoevsky`, `aesop`. A test now asserts every `philosopherId` exists in `PERSONAS`
and that `philosopherAr` matches `nameAr` exactly.

### D51 - Redemption is a separate request from the roll

Splitting `/roll` from `/open` buys single use (the token is spent before the riddle is
looked up) and puts Turnstile where the value is — the riddle, not the roll. A reader
who loses rolls is not a problem.

`/answer` re-checks both ceilings at **award** time. A token lives ten minutes, and a
budget can fill inside ten minutes; paying against the roll-time reading would overshoot
the ceiling by exactly what the reader is owed. When the purse is empty the reader is
told the riddle was solved and the prize is unavailable — unpleasant, but a false
congratulations is worse.

### D52 - The leak gate is mechanical, and its term list is held honest by a test

`scripts/check-no-riddle-leak.mjs` scans every client chunk **and every route's
prerendered HTML separately** — a value can be serialised into the RSC payload without
appearing in any chunk, and only one of the two paths is caught by grepping the bundle.
It fails the build on an acceptance phrase, a resolution, or any settings key. It is
verified to fire: an injected answer and an injected probability each fail it.

It duplicates the bank's phrases because plain Node cannot import a `.ts` module. That
duplication is guarded three ways in `riddle.test.ts`: every bank phrase must appear in
the list, every resolution must be watched by a prefix, and **no stale term may remain**
— a leftover term fails the build on ordinary product copy, and the natural response to
a gate that blocks every build is to delete the gate.

Its first term list was *every* acceptance word and it failed on ordinary copy
("مثال", "داخل", "الحكم", "داخل"). Phrase-level acceptance fixed this at the source.

### D53 - IP counters are HMACs, and there is no counter without a secret

A bare SHA-256 of an IPv4 address is reversible by brute force — there are four
billion of them. `ipBucket()` keys HMAC-SHA256 with the server secret and truncates.
With no secret it returns `null` and **no IP document is written at all**: a plain-hash
fallback would look like protection while storing something reversible.

### D54 - Read-modify-write, and the overshoot it allows

Firestore REST on the edge has no `runTransaction` without `@google-cloud/firestore`,
which is a Node library and forbidden here. Two simultaneous wins in the same second
can both pass the ceiling check and overshoot by one.

That is the right trade. The ceiling is a budget guard, not an accounting system — one
seven-day grant against a ceiling of twelve is a few cents, and the alternative is a
Node dependency in an edge bundle. The note is in `store.ts` so nobody "fixes" it
without knowing the cost.

### D55 - "Cluster detection" is account age, and is not called that

The brief asked for detection of clusters of new accounts. What ships is a **per-account
age check**: an account whose `auth_time` is under 24 hours is refused a roll. That is
a proxy, not cluster detection — real clustering needs cross-account correlation over
data this product deliberately does not collect. Recorded as a gap rather than dressed
up.

### What the terms say

`/terms` gained a section in honest wording: the draw is server-side, the browser never
learns the odds, the prize is days of the paid tier at most once per thirty days within
global ceilings, three attempts, ten-minute single-use tokens, and — stated plainly —
**the prize carries no obligation and no guarantee**: we may stop the riddle, lower its
odds, or cancel prizes not yet earned, while prizes already granted are not revoked.

---

## Signals — the AI's memory

### What was built

| Area | Where |
|---|---|
| Closed signal vocabulary + the forbidden list | `src/lib/signals/types.ts` |
| Two-switch consent, evaluated in order, failing closed | `src/lib/signals/consent.ts` |
| The sender — `sendBeacon`, same origin, gated before serialising | `src/lib/signals/track.ts` |
| Memory profile, sensitive-attribute ban, 600-token budget | `src/lib/signals/memory.ts` |
| The golden rule | `src/lib/signals/prompt.ts` |
| Receiver, aggregate folding | `src/app/api/signals/route.ts` |
| Rolling 12-month retention | `src/lib/signals/retention.ts` |

**17 unit tests** in `redteam.test.ts`, **9 e2e** in `e2e/signals.spec.ts`.

### The forbidden list, enforced

`FORBIDDEN_SIGNAL_KINDS` is asserted against in tests: `keystroke`,
`pointer_move`, `scroll_depth`, `canvas_fingerprint`, `font_fingerprint`,
`audio_fingerprint`, `ip_address`, `raw_conversation_text`, `raw_journal_text`,
`device_id`. `isCollectable()` rejects anything outside the five-kind vocabulary
before the consent check is even consulted, and rejects any `value` that is not a
lowercase slug — so prose cannot ride in the value field.

`e2e/signals.spec.ts` proves two things by watching traffic rather than by reading
state:

- **consent off → zero requests** to `/api/signals`
- **nothing is sent to an origin that is not this product's own datastore**, and no
  write at all leaves the origin

### Red team — 20 adversarial inputs

Each pairs an input with what must never come out: a goal disclosing illness,
faith, orientation, a vote, income or debt; a goal asking the product to watch
them; a prompt-injection attempt smuggled through a goal; an indirect phrasing of
depression ("لا فائدة من كل شيء"); and medical or financial status phrased to evade
the obvious keywords.

Asserted: no block contains any of `FORBIDDEN_PHRASES`; every refused goal is
recorded with a category; the case count cannot quietly shrink.

A scrubber that refuses ordinary philosophical language would empty the profile and
the product would look as though it had forgotten everything — so there is a test
that the ordinary words ("المعنى", "الحرية", "الموت", "العدل") are **not** flagged.
A scrubber that never refuses anything would be tested by the same 20 inputs.

### Acceptance criteria

| Criterion | Status |
|---|---|
| Turning personalization off stops signals being sent | ✅ **proven by network.** Zero requests counted while the product is used |
| Full clear deletes signals and summary | ⚠ **the gate and the schema are proven; the routes are not built.** See below |
| Export includes memory | ⚠ not built |
| Red team, 20 inputs, no inference revealed, no "watching you" | ✅ **17 tests.** `breaksGoldenRule` over 20 adversarial profiles |
| No signal linked to identity without consent | ✅ **proven.** Unidentified batches dropped server-side; a forged uid with a forged token writes nothing |

### What is not built

- **No consent UI.** `CONSENT_COPY_AR` holds the wording — two switches, the
  accept/reject framing, and what each switch does *not* collect — but no component
  renders it, and it is not yet shown at signup.
- **No "ذاكرة الحكيم" page.** No view, no per-item edit or delete, no pause, no
  export, no full clear.
- **No memory profile writer.** The schema, the scrubber and the budget exist; the
  lazy first-session-of-the-day recompute (the `waitUntil` the brief specifies,
  since Pages has no Cron Triggers) is **not implemented**.
- **The memory is not injected into any prompt.** `buildSystemMemorySection()` is
  ready but `/api/ai` does not call it, so continuity is not yet real.
- **Not wired to the five consumers.** Next-question suggestion, lesson/path
  recommendation, quote of the day, weekly tracker summary and invite timing all
  read nothing yet. `pickQuoteOfTheDay` now *accepts* an interests parameter and
  narrows by topic, so that one is a call site away.
- **No admin kill switch UI.** `readGlobal()` honours `siteConfig/flags.signalsEnabled`
  and fails to enabled when unreadable, but there is no admin control.
- **Firestore rules do not cover `users/{uid}/consent`, `signals/*` or
  `memory/profile`.** Untested (no JRE), like the journal rules.

Nothing here is a stub: each gap is a component or call site away from code that is
tested, not a placeholder returning invented data.

---

## Firebase Console — manual steps

Everything below **cannot be done from this repo**. It is console work, and until it
is done the corresponding feature is inert or broken. Ordered so the app is usable
at each stage.

### A. Project basics
- [ ] **Authentication → Sign-in method**
  - [ ] **Anonymous** — ON. Required by "جرّب كضيف" on `/enter`. Without it the
        guest button throws `auth/operation-not-allowed`.
  - [ ] **Email/Password** — ON.
  - [ ] **Google** — ON, and add the support email as an authorised client.
  - [ ] **Email link (passwordless)** — ON. `/enter` has a "لديّ رمز استعادة"
        flow that completes an emailed code; this is what delivers it.
- [ ] **Authentication → Settings → Authorised domains**
  - [ ] `mindinbox-final.pages.dev`
  - [ ] `localhost`
  - [ ] Any custom domain, before it is used for OAuth.

### B. Password policy
- [ ] **Authentication → Settings → Password policy**
  - [ ] Require at least **10 characters**. This mirrors `MIN_PASSWORD_LENGTH` in
        `src/lib/auth/errors.ts`; the two must agree or the client will accept a
        password the server rejects.
  - [ ] **Leave composition rules OFF.** (Upper/lower/digit/symbol requirements
        push people toward predictable variants like `Password1!`. NIST SP
        800-63B advises against them; length plus Firebase's breach check is the
        stronger control.)
  - [ ] Do not enable email-link-only enforcement; it would break `/enter`'s
        password tab.

### C. Identity Platform — the one that breaks account deletion
- [ ] **Authentication → Settings → Identity Platform → Email sign-in (no password)**
  - [ ] Set **"Email link sign-in provider"** to **DISABLE**.
  - [ ] Reason: `DELETE /api/account/delete-auth` posts to
        `accounts:delete` with `localId` + `idToken`. When passwordless is
        available, that endpoint expects an `oobCode` instead, and the deletion
        half of the flow fails *after* Firestore data is already gone.

### D. Service account (needed by the server, never the browser)
- [ ] **Project settings → Service accounts → Generate new private key**
- [ ] Add the JSON as a Cloudflare **Secret** named `FIREBASE_SERVICE_ACCOUNT_JSON`.
      Never as a plain variable, never with a `NEXT_PUBLIC_` prefix.
- [ ] Grant it these roles, or scope them more tightly:
  - [ ] **Firebase Authentication Admin** (`roles/firebaseauth.admin`) — required
        for `accounts:delete`.
  - [ ] **Cloud Datastore User** (`roles/datastore.user`) — required for the
        privileged Firestore REST writes (`subscriptions`, `usage`, `grants`,
        `metrics`) and the deletion cascade.
  - [ ] Deliberately **not** Owner, and **not** Firebase Rules Admin.

### E. Admin bootstrap
- [ ] Create the first admin document by hand, from the Firebase console or the
      emulator. The rules deny client writes to `admins/*` on purpose, so there is
      no UI for this and that is not an oversight:
  - [ ] Path: `admins/{your-uid}`
  - [ ] Field: `role` = `"admin"`, `createdAt` = now.
  - [ ] Get your uid from **Authentication → Users**.
- [ ] Note: admin status is a *document existing*, not a custom claim. No claim
      needs minting, and revocation is immediate — deleting the document takes
      effect on the very next request rather than in up to an hour.

### F. Turnstile
- [ ] **dash.cloudflare.com → Turnstile → Add widget**, mode *Managed*.
- [ ] Add `TURNSTILE_SECRET_KEY` as a Cloudflare **Secret**.
- [ ] Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a **plain text** variable for both
      Production and Preview. It is public by design and inlined at build time.
- [ ] Add the sitekeys `localhost` and `mindinbox-final.pages.dev` (and your
      custom domain) to the widget's allowed hostnames.
- [ ] Until the secret is set, `/api/auth/turnstile` returns 403 for every signup.
      **That is deliberate**: the gate fails closed rather than open.

### G. Firestore and Storage rules
- [ ] Create the Firestore database in **Native mode** (not Datastore mode).
- [ ] Deploy the rules: `npx firebase deploy --only firestore:rules,storage:rules`
- [ ] Verify in the console that `subscriptions`, `usage`, `grants` and `metrics`
      are **not** writable from a browser session — try it with the emulator
      (`npm run test:rules`) rather than in production.
- [ ] Regenerate `storage.rules` if you add bucket paths. The current file denies
      everything not explicitly matched, including a catch-all.

### H. Cloudflare environment variables (both must be set, separately)
- [ ] **Plain text** — inlined into the bundle at build time, so a value set only
      on Production will be missing from a Preview build:
  - [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`,
        `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, `MEASUREMENT_ID`
  - [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - [ ] `NEXT_PUBLIC_SITE_URL`
- [ ] **Secret** — read at request time only:
  - [ ] `ANON_SESSION_SECRET`
  - [ ] `RIDDLE_SIGNING_SECRET` — for the golden-token riddle. ≥32 chars. Distinct
        from `ANON_SESSION_SECRET` in production even though the code falls back to it.
  - [ ] `TURNSTILE_SECRET_KEY`
  - [ ] `FIREBASE_SERVICE_ACCOUNT_JSON`
- [ ] Re-trigger a build after setting any plain-text variable.

### I. Emulator prerequisites (local only)
- [ ] Install a JRE (17+). `firebase-tools` needs `java` on PATH; without it
      `npm run test:rules` fails with `Could not spawn java -version` and the
      rules tests cannot run at all. This is the one acceptance criterion of the
      identity layer that is currently unverified — see ORPHANS & PENDING.
- [ ] `npm run test:rules` (Firestore) and `npm run test:rules:storage`.

---


| Variable | Scope | Required | Status |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (7) | build + runtime | **yes** | ❌ **absent in production** |
| `GEMINI_API_KEY` | edge | one of | ✅ set |
| `GROQ_API_KEY` | edge | one of | ✅ set |
| `NVIDIA_API_KEY` | edge | one of | ✅ set |
| `BYTEZ_API_KEY` | edge | no | ⚠ present but non-functional |
| `ANON_SESSION_SECRET` | edge | **yes** | ❌ **absent in production** |
| `RIDDLE_SIGNING_SECRET` | edge | **yes for the riddle** | ❌ **absent** — falls back to `ANON_SESSION_SECRET`, and must be ≥32 chars. Without it `/api/riddle/*` returns 503 and fails closed. One secret doing two jobs; split it before the deployment is public. |
| `GEMINI_MODEL` / `GROQ_MODEL` / `NVIDIA_MODEL` / `BYTEZ_MODEL` | edge | no | defaults compiled in |
| `BYTEZ_BASE_URL` | edge | no | defaults to `api.gpt.ge/v1` (dead) |
| `AI_BASE_URL_ANTHROPIC` / `_GEMINI` / `_GROQ` / `_NVIDIA` | edge | no | unset — override a provider's endpoint (D34). https-only for Anthropic and Gemini. Used by the e2e suite to reach `scripts/fake-upstream.mjs`. |
| `ANTHROPIC_API_KEY` | edge | no | **still missing from `.env.example`** — the adapter exists and is absent from every default chain, so Anthropic is unavailable until this is added |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | no | ⚠ documented, unused — remove |
| `ADMIN_UID` | — | no | ⚠ documented, unused — remove |

`GET /api/ai` is the runtime probe: reports `providers[]` and `metering: "signed" | "disabled"`
without exposing any secret.