# Mind in a Box — Cloudflare Pages / Edge deployment

## Runtime contract

- Next.js App Router lives only in `src/app`. `next.config.mjs` is the only Next config.
- Framework versions are **pinned** and must not float: Next `14.2.15`, React / React DOM `18.3.1`.
- Every API route declares `export const runtime = "edge"`. Two exist:
  - `src/app/api/ai/route.ts` — AI gateway + anonymous metering
  - `src/app/api/admin/verify/route.ts` — reports whether an ID token carries `admin: true`
- No Node built-ins (`fs`, `path`, `crypto`, `Buffer`) in any server/edge code path.
  Token verification and metering use **Web Crypto** (`crypto.subtle`) and Web `fetch` only
  (`src/lib/edge-auth.ts`, `src/lib/anon-session.ts`).
- Verify with `npm run build`, then `npx tsc --noEmit`.

## Database and auth

Firebase **Client SDK only** (`firebase/auth`, `firebase/firestore`, `firebase/storage`).
`firebase-admin` is deliberately absent — it depends on Node `net`/`crypto` and cannot run on
Workers. Firestore initialises with `persistentLocalCache` + `persistentMultipleTabManager`,
so the tracker keeps working offline and queued writes sync on reconnect.

Deploy `firestore.rules` and `storage.rules` before enabling the UI:
```bash
npx firebase deploy --only firestore:rules,storage
```

## Cloudflare environment variables

Set as **secrets** in the Pages dashboard (or `wrangler pages secret put <NAME>`).
Never prefix provider secrets with `NEXT_PUBLIC_`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Public Firebase web config (safe in the browser) |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `NVIDIA_API_KEY` / `BYTEZ_API_KEY` | AI providers; order is the failover chain |
| `GEMINI_MODEL` / `GROQ_MODEL` / `NVIDIA_MODEL` / `BYTEZ_MODEL` | Optional model pin |
| `BYTEZ_BASE_URL` | Bytez has no stable OpenAI-compatible host |
| `ANON_SESSION_SECRET` | ≥32 chars. Signs the anonymous usage cookie. **Mandatory in production** |
| `ADMIN_UID` | Local-development convenience only (see Security) |

Copy `.env.example` for the full annotated list.

### AI provider models

Defaults were resolved against each provider's live catalogue on 2026-10:

| Provider | Default model |
| --- | --- |
| Gemini | `gemini-3.8-flash` |
| Groq | `openai/gpt-oss-120b` |
| NVIDIA | `nvidia/nemotron-3.5-lightning-30b-a3b` |
| Bytez | `llama3.1-70b` (host must be set via `BYTEZ_BASE_URL`) |

Provider catalogues churn and retired ids fail silently into the failover chain. If answers
start reporting the wrong `via`, re-check the catalogue and pin a current id.
`GET /api/ai` returns the list of currently configured providers — no secrets, safe to poll.

## Security model

### Authorisation
The Admin Console is gated on a **cryptographically verified** Firebase ID token plus the
`admin: true` custom claim (`src/lib/edge-auth.ts`): RS256 signature checked against Google's
JWKS, algorithm pinned to RS256 to block `alg: none` / HS256 confusion, and issuer + audience
checked against the project id.

`isAdmin` in the client store exists **only** to decide whether to render the console UI. It is
never the control. Every mutation the console performs is authorised a second time by
`firestore.rules` (`isAdmin()` → `request.auth.token.admin == true`).

The previous build authorised on `uid === process.env.NEXT_PUBLIC_ADMIN_UID || true`, which
granted console access to every visitor. Do not reintroduce a client-side shortcut.

Grant the claim (trusted provisioning only):
```bash
node -e 'const a=require("firebase-admin");a.initializeApp();a.auth().setCustomUserClaims("<UID>",{admin:true})'
```

The console is unlinked from the sidebar, marked `robots: noindex`, and
`/god-mode-admin` is now a redirect to `/admin` so there is a single entry point.

### Free-tier metering — honest scope
The 5-attempt gate is enforced server-side in an HMAC-signed `httpOnly` cookie
(`miab_anon`), replacing a `localStorage` counter that anyone could reset.

What the signature guarantees: a tampered cookie is never honoured as a valid session —
editing the payload yields a *fresh* session, never a forged high quota. The 6th attempt
returns `402` with `code: "gate"`.

What it does **not** guarantee: deleting the cookie grants a fresh 5-attempt session.
Cookie-only metering is inherently clear-cookieable. Treat the gate as a conversion device,
not an anti-abuse control. Hard enforcement needs server-side state (Cloudflare KV, a Durable
Object) or mandatory sign-in for the AI surface.

If `ANON_SESSION_SECRET` is unset the limit is not enforced at all; `GET /api/ai` then reports
`metering: "disabled"`.

### Subscriptions
There is **no payment provider or webhook** in this codebase. `subscriptionTier` on
`users/{uid}` may only be written by an administrator, and `firestore.rules` locks self-updates
to `email`/`displayName` only. Membership activation must come from a trusted billing
integration; pricing in the console is **display configuration** only.

The 14-day free trial is a display/UX affordance. `trialEnd` is clamped by rules to
`[now, now + 14d]` and grants no read access on its own — `siteConfig/library` still requires
`subscriptionTier ∈ {oracle, sanctum}`.

### IP Shield
`src/components/PremiumShield.tsx` deters casual copying (context menu, copy/cut, drag,
Ctrl/Cmd+C/X/A/S/U/P, print stylesheet). This is **not** a content-security boundary: any
material a member can view can be screenshotted or redistributed. Real protection is the
Firestore/Storage rules.

## Deployment

```bash
npm install
npm run build          # framework build + type/lint gate
npm run pages:build    # @cloudflare/next-on-pages adapter
npm run pages:deploy   # upload .vercel/output
```

`wrangler.toml` pins `pages_build_output_dir = ".vercel/output"`. `public/_headers` applies
security headers (CSP, HSTS, frame denial, immutable caching for `/_next/static`).

Note: `@cloudflare/next-on-pages` may fail to spawn `npx` on native Windows. Run the adapter in
WSL, Linux, or Cloudflare-compatible CI when that happens.