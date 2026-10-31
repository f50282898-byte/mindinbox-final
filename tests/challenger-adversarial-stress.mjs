/**
 * Challenger Adversarial Stress Test Suite
 * Milestone M2 Iteration 2
 *
 * Empirical verification of:
 * 1. Pre-aborted signal handling in sseResponse, /api/ai, and /api/dialogue
 * 2. Mid-flight consumer cancellation & upstream generator cleanup
 * 3. Immediate reader resolution when abort occurs during asynchronous producer sleep
 * 4. Concurrent / duplicate reader cancellations
 * 5. High-concurrency burst (100 streams) under arbitrary abort timings
 * 6. Zero unhandled promise rejections or uncaught exceptions
 */

import { sseResponse } from "../src/lib/ai/http.ts";
import { POST as aiPost } from "../src/app/api/ai/route.ts";
import { POST as dialoguePost } from "../src/app/api/dialogue/route.ts";
import { overrideAdapters } from "../src/lib/ai/providers/index.ts";

const unhandledRejections = [];
const uncaughtExceptions = [];

process.on("unhandledRejection", (reason) => {
  unhandledRejections.push(reason);
});
process.on("uncaughtException", (err) => {
  uncaughtExceptions.push(err);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function timeoutRace(promise, timeoutMs, timeoutMsg) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

let mockStreamCleanedUp = false;
let mockChunksYielded = 0;
let mockStreamCalled = false;

function resetMockState() {
  mockStreamCleanedUp = false;
  mockChunksYielded = 0;
  mockStreamCalled = false;
}

function installMockAdapter() {
  overrideAdapters([
    {
      id: "gemini",
      configured: () => true,
      async stream(call) {
        mockStreamCalled = true;
        if (call.signal.aborted) {
          mockStreamCleanedUp = true;
        } else {
          call.signal.addEventListener("abort", () => {
            mockStreamCleanedUp = true;
          }, { once: true });
        }
        const chunks = (async function* () {
          try {
            for (let i = 0; i < 50; i++) {
              if (call.signal.aborted) {
                return;
              }
              mockChunksYielded++;
              yield `كلمة-${i} `;
              await sleep(20);
            }
          } finally {
            mockStreamCleanedUp = true;
          }
        })();
        return {
          chunks,
          usage: async () => ({ promptTokens: 10, completionTokens: 20 }),
        };
      },
    },
  ]);
}

const tests = [];
function record(name, passed, info) {
  tests.push({ name, passed, info });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name} -> ${info}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pre-aborted sseResponse immediate completion
// ─────────────────────────────────────────────────────────────────────────────
async function testPreAbortedImmediate() {
  const name = "Pre-aborted sseResponse immediately completes without producer call";
  resetMockState();

  const reqCtrl = new AbortController();
  reqCtrl.abort(new Error("user_aborted"));

  let producerCalled = false;
  const res = sseResponse(
    async (signal, emit) => {
      producerCalled = true;
      emit({ type: "delta", delta: "should_never_emit" });
    },
    {},
    reqCtrl.signal
  );

  const reader = res.body.getReader();
  const start = Date.now();
  const read = await timeoutRace(reader.read(), 200, "Hung waiting for reader.read()");
  const elapsed = Date.now() - start;

  const passed = !producerCalled && read.done === true && elapsed < 100;
  record(name, passed, `done=${read.done}, producerCalled=${producerCalled}, elapsed=${elapsed}ms`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mid-stream abort closes reader immediately even if producer is sleeping
// ─────────────────────────────────────────────────────────────────────────────
async function testMidStreamAbortImmediateReaderResolution() {
  const name = "Mid-stream abort resolves reader immediately while producer sleeps";
  resetMockState();

  const reqCtrl = new AbortController();
  let producerAwoke = false;

  const res = sseResponse(
    async (signal, emit) => {
      emit({ type: "delta", delta: "chunk1" });
      await sleep(2000);
      producerAwoke = true;
    },
    {},
    reqCtrl.signal
  );

  const reader = res.body.getReader();
  const chunk1 = await reader.read();

  const abortTime = Date.now();
  reqCtrl.abort("client_timeout");

  const chunk2 = await timeoutRace(reader.read(), 300, "Hung waiting for reader after abort");
  const readerResolutionMs = Date.now() - abortTime;

  const passed = chunk2.done === true && readerResolutionMs < 200 && !producerAwoke;
  record(
    name,
    passed,
    `readerResolution=${readerResolutionMs}ms, done=${chunk2.done}, producerAwoke=${producerAwoke}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/ai pre-aborted signal on regular chat prompt
// ─────────────────────────────────────────────────────────────────────────────
async function testAiPostPreAbortedNormalChat() {
  const name = "POST /api/ai pre-aborted signal on standard chat returns 200 and instant done:true";
  installMockAdapter();
  resetMockState();

  const reqCtrl = new AbortController();
  reqCtrl.abort("pre_aborted_by_client");

  const req = new Request("https://mindinbox.test/api/ai", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mindinbox.test",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "مرحبا بك يا فيلسوف، ما هي المعرفة؟" }],
    }),
    signal: reqCtrl.signal,
  });

  const res = await aiPost(req);
  if (res.status !== 200) {
    record(name, false, `Status was ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const read = await timeoutRace(reader.read(), 300, "Hung waiting for reader.read() on /api/ai pre-abort");

  const passed = read.done === true && !mockStreamCalled && mockChunksYielded === 0;
  record(name, passed, `done=${read.done}, streamCalled=${mockStreamCalled}, chunks=${mockChunksYielded}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/ai mid-flight cancellation triggers generator cleanup
// ─────────────────────────────────────────────────────────────────────────────
async function testAiPostMidFlightCancellation() {
  const name = "POST /api/ai mid-flight cancellation cleans up generator without error event";
  installMockAdapter();
  resetMockState();

  const reqCtrl = new AbortController();
  const req = new Request("https://mindinbox.test/api/ai", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mindinbox.test",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "تحدث عن فضيلة العدالة بتفصيل" }],
    }),
    signal: reqCtrl.signal,
  });

  const res = await aiPost(req);
  if (res.status !== 200) {
    record(name, false, `Status was ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const textDecoder = new TextDecoder();
  let receivedFrames = "";
  let receivedDeltas = 0;

  // Read until we get a delta frame, ensuring the streaming loop is actively running
  for (let i = 0; i < 5; i++) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const text = textDecoder.decode(chunk.value);
    receivedFrames += text;
    if (text.includes('"delta"')) {
      receivedDeltas++;
      break;
    }
  }

  // Cancel reader mid-stream
  await reader.cancel("client_navigated_away");
  await sleep(150);

  // Subsequent reads must be done
  const chunkAfter = await reader.read();

  const cleanedUp = mockStreamCleanedUp;
  const hasNoUpstreamError = !receivedFrames.includes("upstream_error");
  const passed = chunkAfter.done === true && cleanedUp && hasNoUpstreamError && receivedDeltas > 0;

  record(
    name,
    passed,
    `done=${chunkAfter.done}, generatorCleanedUp=${cleanedUp}, hasNoUpstreamError=${hasNoUpstreamError}, yieldedCount=${mockChunksYielded}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/dialogue pre-aborted signal on dialogue round
// ─────────────────────────────────────────────────────────────────────────────
async function testDialoguePostPreAbortedRound() {
  const name = "POST /api/dialogue pre-aborted signal returns 200 and instant done:true";
  installMockAdapter();
  resetMockState();

  const reqCtrl = new AbortController();
  reqCtrl.abort("pre_aborted_by_client");

  const req = new Request("https://mindinbox.test/api/dialogue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mindinbox.test",
    },
    body: JSON.stringify({
      mode: "round",
      question: "هل يمكن للعدالة أن تتحقق في مجتمع غير ديمقراطي؟",
      personas: ["plato", "rumi"],
      round: 1,
      transcript: [],
    }),
    signal: reqCtrl.signal,
  });

  const res = await dialoguePost(req);
  if (res.status !== 200) {
    record(name, false, `Status was ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const read = await timeoutRace(reader.read(), 300, "Hung waiting for reader.read() on /api/dialogue pre-abort");

  const passed = read.done === true && !mockStreamCalled && mockChunksYielded === 0;
  record(name, passed, `done=${read.done}, streamCalled=${mockStreamCalled}, chunks=${mockChunksYielded}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /api/dialogue pre-aborted signal on summary
// ─────────────────────────────────────────────────────────────────────────────
async function testDialoguePostPreAbortedSummary() {
  const name = "POST /api/dialogue pre-aborted signal on summary returns 200 and instant done:true";
  installMockAdapter();
  resetMockState();

  const reqCtrl = new AbortController();
  reqCtrl.abort("pre_aborted_by_client");

  const req = new Request("https://mindinbox.test/api/dialogue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mindinbox.test",
    },
    body: JSON.stringify({
      mode: "summary",
      question: "ما هو الوجود؟",
      transcript: [
        { speaker: "أفلاطون", content: "الفضيلة هي المعرفة." },
        { speaker: "الرومي", content: "الحكمة والشريعة متوافقتان بالحب." },
      ],
    }),
    signal: reqCtrl.signal,
  });

  const res = await dialoguePost(req);
  if (res.status !== 200) {
    record(name, false, `Status was ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const read = await timeoutRace(reader.read(), 300, "Hung waiting for reader.read() on /api/dialogue summary pre-abort");

  const passed = read.done === true && !mockStreamCalled && mockChunksYielded === 0;
  record(name, passed, `done=${read.done}, streamCalled=${mockStreamCalled}, chunks=${mockChunksYielded}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /api/dialogue mid-stream cancellation halts multi-turn generation
// ─────────────────────────────────────────────────────────────────────────────
async function testDialoguePostMidFlightCancellation() {
  const name = "POST /api/dialogue mid-flight cancel halts philosopher rounds";
  installMockAdapter();
  resetMockState();

  const reqCtrl = new AbortController();
  const req = new Request("https://mindinbox.test/api/dialogue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://mindinbox.test",
    },
    body: JSON.stringify({
      mode: "round",
      question: "ما هو جوهر النفس؟",
      personas: ["plato", "rumi"],
      round: 1,
      transcript: [],
    }),
    signal: reqCtrl.signal,
  });

  const res = await dialoguePost(req);
  if (res.status !== 200) {
    record(name, false, `Status was ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  // Read first frame (turn_start)
  const chunk1 = await reader.read();

  // Cancel request signal & reader
  reqCtrl.abort("user_left_dialogue");
  await reader.cancel("user_left_dialogue");
  await sleep(150);

  const finalRead = await reader.read();
  const cleanedUp = mockStreamCleanedUp;
  const passed = finalRead.done === true && cleanedUp;

  record(
    name,
    passed,
    `done=${finalRead.done}, generatorCleanedUp=${cleanedUp}, chunksEmitted=${mockChunksYielded}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Double cancel & cancel before first read
// ─────────────────────────────────────────────────────────────────────────────
async function testDoubleCancelBeforeRead() {
  const name = "Concurrent double reader.cancel() does not throw or corrupt stream";
  resetMockState();
  let producerSawAbort = false;

  const res = sseResponse(async (signal, emit) => {
    signal.addEventListener("abort", () => {
      producerSawAbort = true;
    });
    for (let i = 0; i < 20; i++) {
      if (signal.aborted) return;
      emit({ type: "delta", delta: "hi" });
      await sleep(10);
    }
  });

  const reader = res.body.getReader();
  let cancelError = null;

  try {
    await Promise.all([
      reader.cancel("first_cancel"),
      reader.cancel("second_cancel"),
    ]);
  } catch (err) {
    cancelError = err;
  }

  const read = await reader.read();
  const passed = !cancelError && read.done === true && producerSawAbort;
  record(name, passed, `cancelError=${cancelError}, done=${read.done}, producerSawAbort=${producerSawAbort}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. High-concurrency burst of 100 mixed-abort streams
// ─────────────────────────────────────────────────────────────────────────────
async function testHighConcurrencyBurst() {
  const name = "High-concurrency burst (100 streams) completes with 0 unhandled rejections";
  const startRejections = unhandledRejections.length;
  const startExceptions = uncaughtExceptions.length;

  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      (async () => {
        const ctrl = new AbortController();
        const mode = i % 4;
        if (mode === 0) {
          // Pre-aborted
          ctrl.abort("pre_aborted");
        }

        const res = sseResponse(
          async (signal, emit) => {
            for (let j = 0; j < 10; j++) {
              if (signal.aborted) return;
              emit({ type: "delta", delta: `chunk-${i}-${j}` });
              await sleep(3);
            }
          },
          {},
          ctrl.signal
        );

        const reader = res.body.getReader();
        if (mode === 1) {
          // Immediate cancel before read
          await reader.cancel("early_cancel").catch(() => {});
        } else if (mode === 2) {
          // Cancel during read
          const r = await reader.read().catch(() => {});
          ctrl.abort("mid_flight_abort");
          await reader.cancel("reader_cancel").catch(() => {});
        } else {
          // Normal read until done
          for (;;) {
            const r = await reader.read().catch(() => ({ done: true }));
            if (r.done) break;
          }
        }
      })()
    );
  }

  await timeoutRace(Promise.allSettled(promises), 5000, "Burst timed out");
  await sleep(100);

  const newRejections = unhandledRejections.length - startRejections;
  const newExceptions = uncaughtExceptions.length - startExceptions;

  const passed = newRejections === 0 && newExceptions === 0;
  record(name, passed, `newRejections=${newRejections}, newExceptions=${newExceptions}`);
}

async function main() {
  console.log("=== RUNNING CHALLENGER ADVERSARIAL STRESS TEST SUITE ===");
  try {
    await testPreAbortedImmediate();
    await testMidStreamAbortImmediateReaderResolution();
    await testAiPostPreAbortedNormalChat();
    await testAiPostMidFlightCancellation();
    await testDialoguePostPreAbortedRound();
    await testDialoguePostPreAbortedSummary();
    await testDialoguePostMidFlightCancellation();
    await testDoubleCancelBeforeRead();
    await testHighConcurrencyBurst();
  } catch (err) {
    console.error("FATAL SUITE CRASH:", err);
  }

  overrideAdapters(null);

  console.log("\n=== CHALLENGE RESULTS ===");
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    if (t.passed) passed++;
    else failed++;
  }
  console.log(`TOTAL: ${tests.length} | PASSED: ${passed} | FAILED: ${failed}`);
  if (unhandledRejections.length > 0) {
    console.error("Unhandled rejections captured:", unhandledRejections);
  }
  if (uncaughtExceptions.length > 0) {
    console.error("Uncaught exceptions captured:", uncaughtExceptions);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
