# Test Infrastructure & Methodology (`TEST_INFRA.md`)
## 4-Tier Opaque-Box AI Interaction Verification Suite

### 1. Architectural Overview
This test infrastructure validates the core AI interaction surface of `mindinbox-final`, specifically targeting `/api/ai` (primary chat and single-persona generation endpoint) and `/api/dialogue` (multi-persona philosophical dialogue orchestration). 

The test suite operates strictly under **opaque-box principles**, driving the route handlers through their public Web HTTP interface contracts (`POST(request: Request)` and `GET()`), without coupling to internal private state.

---

### 2. The 4-Tier Test Architecture

```
+-----------------------------------------------------------------------+
| Tier 4: Real-World Scenarios                                          |
| - Philosophical Arabic Dialogue (Plato & Rumi / Dostoevsky)           |
| - Wellbeing / Crisis Safety Interception Guard                        |
| - Configuration & Breaker Probe Contract                              |
+-----------------------------------------------------------------------+
                                  ▲
+-----------------------------------------------------------------------+
| Tier 3: Cross-Feature & Failover                                      |
| - Provider Failover Resilience (Primary Failure -> Secondary Success) |
| - All-Provider Down Exhaustion & Terminal Error Frames                |
| - Client Abort & Stream Cancellation Propagation                      |
| - Mid-Stream Network Drops & Upstream Error Reporting                 |
+-----------------------------------------------------------------------+
                                  ▲
+-----------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases                                       |
| - Empty, Truncated & Whitespace Prompt Validation (400)               |
| - Invalid Persona Fallback (/api/ai) vs. Strict Rejection (/dialogue) |
| - Quota Gate Exhaustion Parity (402 Payment Required)                 |
| - Burst Rate-Limiting Gate (429 Too Many Requests)                    |
| - CSRF & Same-Origin Verification (403 Forbidden)                     |
+-----------------------------------------------------------------------+
                                  ▲
+-----------------------------------------------------------------------+
| Tier 1: Feature Coverage                                              |
| - Single Chat Generation (SSE Stream Framing, Content-Type, Headers)   |
| - Multi-Turn Conversational History & System Turn Normalization       |
| - Dialogue Multi-Round Turn Protocol (turn_start -> delta -> turn_end) |
| - SSE Wire Protocol & Multi-Byte UTF-8 Arabic Stream Integrity        |
+-----------------------------------------------------------------------+
```

---

### 3. Test Cases Specification

#### Tier 1: Feature Coverage
1. **Single Chat Generation (`/api/ai`)**:
   - Dispatches a single user prompt (`"ما هي الحكمة؟"`).
   - Verifies HTTP 200 with `Content-Type: text/event-stream; charset=utf-8` and `Cache-Control: no-store, no-transform`.
   - Validates proper emission of `quota` event, sequence of text `delta` frames, terminal `done` frame with token usage metrics, and terminating `data: [DONE]\n\n`.
2. **Multi-Turn Chat History (`/api/ai`)**:
   - Submits structured conversation history across multiple turns (`user`, `assistant`/`model`).
   - Verifies system message handling and proper role normalization.
3. **Dialogue Multi-Speaker Stream Event Handling (`/api/dialogue`)**:
   - Dispatches round 1 dialogue request for two distinct thinkers (`plato`, `rumi`).
   - Asserts sequential turn framing:
     - Speaker 1: `turn_start` -> `turn_delta` -> `turn_end`.
     - Speaker 2: `turn_start` -> `turn_delta` -> `turn_end`.
   - Confirms `quota` emission and `preview_end` signal on guest preview completion.
4. **SSE UTF-8 Framing & Parsing Integrity**:
   - Verifies robust chunk boundary handling for Arabic characters without mojibake or replacement characters (`\uFFFD`).

#### Tier 2: Boundary & Corner Cases
1. **Empty & Malformed Prompt Handling**:
   - Empty messages array (`[]`) -> rejects with HTTP 400.
   - Message with empty string (`""`) -> rejects with HTTP 400.
   - Missing required body fields -> rejects with HTTP 400.
   - Dialogue question length < 3 chars -> rejects with HTTP 400.
   - Dialogue duplicate personas (`["plato", "plato"]`) -> rejects with HTTP 400 (`اختر فيلسوفين مختلفين.`).
2. **Invalid Persona Fallback vs. Validation**:
   - `/api/ai` with unrecognized `personaId` (`"unknown-thinker"`) -> gracefully falls back to default persona (`plato`) without throwing errors.
   - `/api/dialogue` with unrecognized `personaId` -> fails schema refinement and rejects with HTTP 400.
3. **Quota Gate Enforcement (HTTP 402)**:
   - Exhausts interaction allowance (`FREE_INTERACTIONS = 5`).
   - Asserts `/api/ai` returns HTTP 402 with JSON payload `{ ok: false, code: "GATE", error: "استنفدت المحاولات المجانية.", ... }`.
   - Asserts `/api/dialogue` returns HTTP 402 with GATE code and limits.
4. **Burst Rate Limiting (HTTP 429)**:
   - Fires > 8 requests in burst window from identical IP/visitor identity.
   - Verifies HTTP 429 response with `RATE_LIMITED` error message.
5. **Cross-Origin Request Forgery (CSRF) Guard (HTTP 403)**:
   - Submits request from unauthorized origin (`https://untrusted-cross-site.example`).
   - Verifies immediate rejection with HTTP 403 `{ error: "cross_origin_forbidden" }`.

#### Tier 3: Cross-Feature & Failover
1. **Seamless Provider Failover**:
   - In a chain `["gemini", "nvidia"]`, simulates primary provider throwing upstream network error or timeout.
   - Verifies automatic failover to `nvidia` adapter without client-visible stream interruption.
   - Emits correct content from secondary provider and finishes cleanly with `done`.
2. **Exhausted Chain Resilience**:
   - Simulates all providers in chain failing.
   - Verifies SSE error frame emission `{ type: "error", code: "provider_unavailable", ... }`.
3. **Empty Provider Chain Gate**:
   - When no provider is configured, returns HTTP 503 `{ code: "no_provider" }`.
4. **Client Abort & Cancellation Handling**:
   - Triggers `AbortController.abort()` or stream reader cancellation mid-flight.
   - Verifies that upstream `signal` abort is invoked immediately, stopping redundant token generation.
5. **Mid-Stream Upstream Failure**:
   - Simulates failure after the first chunk has already been dispatched.
   - Verifies terminal event `{ type: "error", code: "upstream_error", message: "انقطع الرد قبل اكتماله." }`.

#### Tier 4: Real-World Scenarios
1. **Arabic Philosophical Dialogue Generation**:
   - Runs a full philosophical inquiry between Plato and Rumi (`"ما هو الجمال؟"`).
   - Validates persona identity attributes: Arabic names (`أفلاطون`, `الرومي`), symbols, and coherent sequential arguments.
2. **Wellbeing Crisis Intervention Guard**:
   - Tests input containing crisis trigger phrases (e.g. self-harm / despair).
   - Validates immediate bypass of quota check and provider chain.
   - Emits compassionate crisis response in Arabic, stamped with `x-wellbeing` header and `x-quota: not-charged`.
3. **Configuration & Service Probe (`GET /api/ai`)**:
   - Validates system health probe endpoint: available provider IDs, registered personas list, Arabic disclosure statement, limits, and circuit breaker status.

---

### 4. Test Execution & Determinism
- **Execution Command**:
  ```bash
  npx vitest run --config vitest.rules.config.ts tests/e2e-ai-verification.test.ts
  ```
- **Seams & Isolation**:
  - `overrideAdapters`: Installs controlled provider adapters to verify failover, timeouts, and cancellations deterministically without live API network costs.
  - `resetDevQuotaCounters`: Clears in-memory quotas and burst windows between test suites to ensure absolute test isolation.
  - Clean restoration in `afterEach` / `afterAll`.
