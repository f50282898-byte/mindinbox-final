#!/usr/bin/env node
/**
 * A deterministic stand-in for the AI providers, for the e2e suite.
 *
 * Why this exists rather than `page.route`: the providers are called from the
 * edge route, **server-side**. Playwright can only intercept requests the
 * browser makes, so faking `/api/ai` from the test would replace the very
 * gateway the acceptance criteria are about — the quota, the SSE framing, the
 * wellbeing guard, the GATE response — with a stand-in and prove nothing.
 *
 * So the providers' base URLs are pointed here (`AI_BASE_URL_*`) and the real
 * route runs end to end. Only the model call is simulated.
 *
 * Speaks all four wire shapes, selected by URL:
 *   POST .../chat/completions                     OpenAI-compatible (Groq/NVIDIA/Bytez)
 *   POST .../v1beta/models/*:streamGenerateContent  Gemini
 *   POST .../v1/messages                          Anthropic
 *
 * Usage: node scripts/fake-upstream.mjs [--port 4010] [--reply "…"]
 */

import { createServer } from "node:http";

const args = process.argv.slice(2);
const num = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? Number(args[i + 1]) : fallback;
};

const PORT = num("port", 4010);
const REPLY =
  args.includes("--reply") && args[args.indexOf("--reply") + 1]
    ? args[args.indexOf("--reply") + 1]
    : "هذه قراءة فلسفية مختصرة للسؤال الذي طرحته.";

/**
 * Returned when the prompt carries the `__MARKDOWN__` marker.
 *
 * Deliberately mixes every construct the renderer supports with a script tag, so
 * the client test can assert both that formatting becomes elements and that the
 * tag does not execute.
 */
const MARKDOWN_REPLY =
  "## عنوان\n\n**غامق**\n\n- بند أول\n- بند ثانٍ\n\n<script>window.__pwned=1</script>";

/**
 * Split into small pieces so the client really sees incremental frames.
 *
 * Newlines are preserved exactly. `.` does not match `\n`, so a naive
 * `match(/.{1,12}/gu)` silently deleted every line break and turned the reply
 * into one long line — which quietly destroyed every heading and list, and made
 * the markdown test pass for the wrong reason.
 */
function pieces(text) {
  const out = [];
  for (const line of text.split("\n")) {
    for (const chunk of line.match(/.{1,12}/gu) ?? []) out.push(chunk);
    out.push("\n");
  }
  // The loop appended a break after the last line; it was not in the source.
  if (out.length > 0 && out[out.length - 1] === "\n") out.pop();
  return out.length > 0 ? out : [text];
}

function openStream(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
  });
  return {
    send: (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`),
    end: () => res.end(),
  };
}

const server = createServer((req, res) => {
  // Never cache: a cached response would make the streaming tests meaningless.
  if (req.url === "/__health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, replies: REPLY.length }));
    return;
  }

  const url = req.url ?? "";

  // Read the body first: a test may ask for a specific reply shape by putting a
  // marker in its prompt. That keeps per-test variation out of the app code and
  // out of the Playwright config.
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const reply = body.includes("__MARKDOWN__") ? MARKDOWN_REPLY : REPLY;

    // OpenAI-compatible: chat/completions
    if (url.includes("/chat/completions")) {
      const s = openStream(res);
      for (const piece of pieces(reply)) {
        s.send({ choices: [{ delta: { content: piece } }] });
      }
      s.send({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 24 },
      });
      res.end();
      return;
    }

    // Gemini: :streamGenerateContent?alt=sse
    if (url.includes(":streamGenerateContent")) {
      const s = openStream(res);
      for (const piece of pieces(reply)) {
        s.send({ candidates: [{ content: { parts: [{ text: piece }] } }] });
      }
      s.send({
        candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 24 },
      });
      res.end();
      return;
    }

    // Anthropic: /v1/messages
    if (url.includes("/v1/messages")) {
      const s = openStream(res);
      s.send({ type: "message_start", message: { usage: { input_tokens: 12, output_tokens: 0 } } });
      s.send({ type: "content_block_start", index: 0 });
      for (const piece of pieces(reply)) {
        s.send({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: piece },
        });
      }
      s.send({ type: "message_delta", usage: { output_tokens: 24 } });
      s.send({ type: "message_stop" });
      res.end();
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown route", url }));
  });
});

server.listen(PORT, () => {
  console.log(`fake upstream on http://127.0.0.1:${PORT}`);
});
