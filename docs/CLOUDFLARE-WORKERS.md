# Cloudflare Workers deployment

The production target is a Cloudflare **Worker**, built with
`@opennextjs/cloudflare`. This replaces the deprecated Pages adapter. OpenNext
currently requires Next.js `>=15.5.27 <16` or `>=16.3.8`; this repository pins
Next.js `15.5.27` and keeps React 18 to minimize the framework migration.

OpenNext does not support Next.js `runtime = "edge"` route exports. Pages and API
routes therefore use Next.js's default Node.js runtime, provided by Cloudflare
Workers' `nodejs_compat` compatibility flag. Do not re-add Edge runtime exports.

## Build and preview

Use Node.js 22 or newer and npm:

```powershell
npm ci
npm run check:env:local
npm run build:cf
npm run preview:worker
```

`build:cf` runs the type, lint, content, security, and unit-test gates before
creating `.open-next/worker.js` and `.open-next/assets`. The preview command runs
that Worker locally through Wrangler/Workerd. OpenNext does not guarantee full
Windows support; use Linux CI or WSL if the local Worker build/preview fails.

## Cloudflare configuration

`wrangler.jsonc` is the single Worker configuration. It enables Node.js
compatibility, serves the OpenNext assets binding, and enables invocation logs.
The compatibility date is pinned; update it deliberately and re-run the local
Worker preview and production build before deployment.

Authenticate once, then deploy:

```powershell
npx wrangler login
npx wrangler whoami
npm run deploy:worker
```

Set a production custom domain or enable the account's `workers.dev` subdomain
in the Cloudflare dashboard. Set `NEXT_PUBLIC_SITE_URL` to the real public
origin **in the build environment**; it is compiled into canonical URLs, the
sitemap, and Open Graph metadata. Do not assume the account-specific
`workers.dev` hostname.

## Variables and secrets

Set runtime secrets as encrypted Worker secrets (never in `wrangler.jsonc` or
source control):

```powershell
npx wrangler secret put ANON_SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler secret put ADMIN_PAGE_SECRET
```

Use separate values for production and preview deployments. `ANON_SESSION_SECRET`
must be at least 32 characters and must differ from `ADMIN_PAGE_SECRET`.

The following public Firebase configuration is compiled into browser JavaScript,
so provide it to the **build job** as plain-text build variables, not only as
runtime Worker secrets:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

Also set `NEXT_PUBLIC_SITE_URL` to the deployed origin at build time.
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` are
optional public build variables. AI provider keys are optional runtime Worker
secrets; configure at least one provider if AI responses are expected.

For local Worker preview, use an ignored `.dev.vars` file for runtime secrets;
use `.env.local` for public build-time values. Never commit either file.

## Deployment gates

Run `npm run build:cf` before every deployment. The production environment gate
intentionally fails until all required build-time values are present. After
deployment, verify the site's canonical origin, authentication, a protected API
request, the response CSP, and static asset caching on the actual Worker domain.

This repository does not deploy automatically from this machine: Cloudflare
account credentials, the public domain, and production secrets are not checked
into source control. Configure them in the Cloudflare dashboard or authenticated
deployment environment before the first production release.
