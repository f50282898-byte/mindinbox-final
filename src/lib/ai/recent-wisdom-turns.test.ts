import { describe, expect, it } from "vitest";
import { recentWisdomTurns } from "./recent-wisdom-turns";

describe("long wisdom conversations", () => {
  it("keeps the new question while fitting Arabic and escaped text inside the wire limit", () => {
    const turns = Array.from({ length: 70 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: ('سؤال "دقيق"\n').repeat(600),
    }));
    const question = { role: "user", content: "كيف أختار؟" };
    const messages = recentWisdomTurns([...turns, question]);
    expect(messages.at(-1)).toEqual(question);
    expect(messages.length).toBeLessThanOrEqual(40);
    expect(messages.every((m) => m.content.length <= 4000)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify({ personaId: "plato", messages })).length).toBeLessThan(65536);
    expect(turns[0].content.length).toBeGreaterThan(4000);
  });
});
