import { afterEach, expect, it, vi } from "vitest";
import { createOpenAiCompatibleAdapter } from "./openai-compatible";

afterEach(() => vi.unstubAllGlobals());

it("only delivers final answer content when a provider streams reasoning first", async () => {
  const frames = [{ reasoning_content: "internal notes" }, { content: "The answer" }];
  const body = frames.map(delta => "data: " + JSON.stringify({ choices: [{ delta }] }) + "\n\n").join("");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const adapter = createOpenAiCompatibleAdapter({
    id: "example", label: "Example", defaultBaseUrl: "https://example.invalid", apiKey: () => "test",
  });
  const stream = await adapter.stream({
    messages: [{ role: "user", content: "hello" }], model: "test", maxOutputTokens: 40,
    temperature: 0.5, signal: new AbortController().signal,
  });
  const output = [];
  for await (const text of stream.chunks) output.push(text);
  expect(output).toEqual(["The answer"]);
});
