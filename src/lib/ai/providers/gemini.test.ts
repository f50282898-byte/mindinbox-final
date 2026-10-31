import { describe, expect, it, vi } from "vitest";
import { createGeminiAdapter } from "./gemini";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const chunk of chunks) ctrl.enqueue(encoder.encode(chunk));
      ctrl.close();
    },
  });
}

describe("Gemini adapter", () => {
  it("reports configured state based on API key availability", () => {
    const unconfigured = createGeminiAdapter(() => null);
    expect(unconfigured.configured()).toBe(false);

    const configured = createGeminiAdapter(() => "fake-key");
    expect(configured.configured()).toBe(true);
  });

  it("injects thinkingConfig: { thinkingBudget: 0 } for gemini-2.5 models", async () => {
    let capturedBody: any = null;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        body: streamOf(['data: {"candidates":[{"content":{"parts":[{"text":"مرحبا"}]}}]}\n\n']),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGeminiAdapter(() => "fake-key");
    const stream = await adapter.stream({
      messages: [{ role: "user", content: "سلام" }],
      model: "gemini-2.5-flash",
      maxOutputTokens: 100,
      temperature: 0.7,
      signal: new AbortController().signal,
    });

    const chunks: string[] = [];
    for await (const chunk of stream.chunks) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["مرحبا"]);
    expect(capturedBody?.generationConfig?.thinkingConfig).toEqual({ thinkingBudget: 0 });

    vi.unstubAllGlobals();
  });

  it("filters out parts with thought: true from the output stream", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        body: streamOf([
          'data: {"candidates":[{"content":{"parts":[{"text":"internal thought", "thought": true}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"final answer"}]}}]}\n\n',
        ]),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGeminiAdapter(() => "fake-key");
    const stream = await adapter.stream({
      messages: [{ role: "user", content: "سؤال" }],
      model: "gemini-2.5-flash",
      maxOutputTokens: 100,
      temperature: 0.7,
      signal: new AbortController().signal,
    });

    const chunks: string[] = [];
    for await (const chunk of stream.chunks) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["final answer"]);
    vi.unstubAllGlobals();
  });

  it("omits thinkingConfig for non-2.5 models", async () => {
    let capturedBody: any = null;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        body: streamOf(['data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n']),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGeminiAdapter(() => "fake-key");
    const stream = await adapter.stream({
      messages: [{ role: "user", content: "test" }],
      model: "gemini-1.5-flash",
      maxOutputTokens: 100,
      temperature: 0.7,
      signal: new AbortController().signal,
    });

    const chunks: string[] = [];
    for await (const chunk of stream.chunks) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["ok"]);
    expect(capturedBody?.generationConfig?.thinkingConfig).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
