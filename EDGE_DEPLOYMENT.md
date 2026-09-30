# Mind in a Box: Edge Deployment

## Runtime and build

- The Next.js App Router lives only in `src/app`; `next.config.mjs` is the only Next config.
- Framework versions are pinned to Next.js `14.2.15`, React `18.3.1`, and React DOM `18.3.1`.
- API handlers use the Edge runtime and the AI route calls providers through Web `fetch` and Web Crypto.
- Verify locally with `npm run build`. The `@cloudflare/next-on-pages` CLI currently fails when it tries to spawn `npx` on this Windows setup; run that adapter in Linux/WSL or Cloudflare-compatible CI.

## Cloudflare environment variables

Set these in Cloudflare Pages project settings. Do not prefix provider secrets with `NEXT_PUBLIC_`.

- Firebase public config: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- AI providers: at least one of `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, or `BYTEZ_API_KEY`. Optional model selectors: `GEMINI_MODEL`, `GROQ_MODEL`, `NVIDIA_MODEL`, `BYTEZ_MODEL`.
- Set `ANON_SESSION_SECRET` to a stable random secret of at least 32 characters. The route has a provider-key fallback for development, but a dedicated stable secret is recommended so changing provider keys does not reset signed usage cookies.
- Set `NEXT_PUBLIC_ADMIN_UID` to the designated administrator's Firebase UID. The UID check in the UI is not authorization by itself; the Firebase ID token must also carry the trusted `admin: true` custom claim for privileged Firestore/Storage rules.

## Firebase setup

Deploy `firestore.rules` and `storage.rules` to the Firebase project before enabling the UI. Configure Google sign-in in Firebase Authentication. Ensure the site's Firebase project ID, auth domain, and storage bucket match the deployed project.

User subscription tiers are trusted only when changed through an administrator-controlled process. The app does not include a payment provider or payment webhooks; pricing is display configuration, and membership activation must be provisioned by a trusted billing/admin integration before paid access is granted.

The UI's selection/context-menu deterrent is not a content-security boundary. Premium Firestore documents and Storage reads are protected by Firebase rules; no browser technique can prevent screenshots or a member from redistributing material they can access.
