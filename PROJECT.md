# Project: mindinbox-final

## Architecture
- **Framework & Runtime**: Next.js 14.2.35 on Cloudflare Pages using `@cloudflare/next-on-pages` (v1.13.16) and Edge Runtime (`export const runtime = 'edge'`).
- **AI Core (`src/lib/ai/`)**:
  - `settings.ts`: Default provider settings, active model IDs, and failover chains (`chat`, `analysis`, `admin`).
  - `providers/`: Adapter layer for Google Gemini (`gemini.ts`), Anthropic (`anthropic.ts`), and OpenAI-compatible providers (`openai-compatible.ts` for NVIDIA, Groq, Bytez).
  - `chain.ts` & `breaker.ts`: Fallback failover engine and circuit breaker for multi-provider resilience.
  - `http.ts` & `sse.ts`: Server-Sent Events (SSE) streaming helpers over standard Web `ReadableStream`.
- **API Entrypoints (`src/app/api/`)**:
  - `/api/ai`: Primary AI chat and single-persona generation endpoint with streaming SSE responses, quota enforcement, and identity resolution.
  - `/api/dialogue`: Multi-persona philosophical dialogue endpoint orchestrating multi-round interactions.
- **Client Integration**:
  - `src/components/MemberLibrary.tsx`: Consumes AI services for member daily analyses and readings.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Google Gemini Model Harmonization | Set valid, officially supported models (`gemini-2.5-flash` / `gemini-2.0-flash` / `gemini-1.5-flash`), clean `models/` prefix in `gemini.ts` | M1 | survey_1, survey_2 |
| 2 | Google API Key Multi-env Fallback | Support `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and `GOOGLE_AI_API_KEY` in `src/lib/ai/providers/index.ts` | M1 | survey_1 |
| 3 | NVIDIA Model & Failover Chain Repair | Set working `nvidia/nemotron-3.5-lightning-30b-a3b` in NVIDIA provider settings and place NVIDIA immediately after Gemini in failover chains | M1 | survey_1 |
| 4 | Adapter Error Observability | Capture `await res.text()` on non-200 responses across all provider adapters for detailed error reporting | M1 | survey_1 |
| 5 | Environment & Config Drift Harmonization | Reconcile model defaults across `settings.ts`, `src/lib/env.ts`, `.env.example`, and documentation | M1 | survey_1 |
| 6 | AbortSignal Client Disconnect Handling | Implement `cancel(reason)` in `ReadableStream` inside `/api/ai` and `src/lib/ai/http.ts` to abort upstream fetches on disconnect | M2 | survey_2 |
| 7 | MemberLibrary SSE Integration | Fix `MemberLibrary.tsx` to consume SSE streams correctly, send `personaId`, and include auth headers | M2 | survey_2 |
| 8 | Client System Message Sanitization | Ensure client-provided `system` role turns are properly filtered or ignored rather than converted to assistant turns | M2 | survey_2 |
| 9 | Dialogue Gate Response Parity | Add `error: "استنفدت المحاولات المجانية."` to gate response in `/api/dialogue/route.ts` | M2 | survey_2 |
| 10 | TypeScript & Quality Gate Validation | Verify that `npx tsc --noEmit`, `next lint`, and project quality scripts pass without errors | M2 | survey_2, survey_3 |
| 11 | Cloudflare Pages Build Configuration | Validate Next.js edge build (`next build`, `wrangler.json`, Pages build environment) | M3 | survey_3 |
| 12 | Post-Deployment AI Effectiveness Verification | Verify `/api/ai` and `/api/dialogue` live response generation with 100% effectiveness | M3 | survey_3, ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | AI Models, Adapters, Settings & Failover Chains | F1, F2, F3, F4, F5: `settings.ts`, `providers/gemini.ts`, `providers/index.ts`, `providers/openai-compatible.ts`, `src/lib/env.ts` | none | DONE |
| M2 | API Routes, Streams, Client Integration & Types | F6, F7, F8, F9, F10: `/api/ai/route.ts`, `/api/dialogue/route.ts`, `src/lib/ai/http.ts`, `MemberLibrary.tsx`, TypeScript validation | M1 | IN_PROGRESS |
| M3 | Cloudflare Pages Build, Deployment & Live Verification | F11, F12: Next edge build, Cloudflare Pages deployment verification, live AI API calls | M2 | PLANNED |

## Interface Contracts
### `src/lib/ai/settings.ts` ↔ `src/lib/ai/providers/`
- `DEFAULT_AI_SETTINGS.providers[id].models`:
  - `gemini`: `{ chat: "gemini-2.5-flash", analysis: "gemini-2.5-flash", admin: "gemini-2.5-flash-lite" }` (or active supported variants)
  - `nvidia`: `{ chat: "nvidia/nemotron-3.5-lightning-30b-a3b", analysis: "nvidia/nemotron-3.5-lightning-30b-a3b", admin: "nvidia/nemotron-3.5-lightning-30b-a3b" }`
- `DEFAULT_AI_SETTINGS.chains`:
  - `chat`: `["gemini", "nvidia", "groq", "anthropic"]`
  - `analysis`: `["gemini", "nvidia", "anthropic", "groq"]`
  - `admin`: `["gemini", "nvidia", "groq", "anthropic"]`

### `src/lib/ai/` ↔ `src/app/api/ai/` & `src/app/api/dialogue/`
- `runChain(...)` returns `AsyncGenerator<StreamEvent>` where events are `{ type: "delta", text }`, `{ type: "reasoning", text }`, `{ type: "done" }`.
- Route sends `Content-Type: text/event-stream; charset=utf-8` with SSE formatted data.
- Upstream fetch receives `signal: controller.signal` where `controller.abort()` is triggered when client stream cancels.

## Code Layout
- `src/lib/ai/settings.ts`: AI configuration and defaults
- `src/lib/ai/providers/`: Provider adapters (`gemini.ts`, `openai-compatible.ts`, `anthropic.ts`, `index.ts`)
- `src/lib/ai/chain.ts`: Failover chain logic
- `src/lib/ai/http.ts`: SSE response helpers
- `src/app/api/ai/route.ts`: Single chat / persona API
- `src/app/api/dialogue/route.ts`: Multi-persona dialogue API
- `src/components/MemberLibrary.tsx`: Member library UI calling `/api/ai`
- `wrangler.json`: Cloudflare Pages configuration
