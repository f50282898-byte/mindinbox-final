import { describe, expect, it } from "vitest";
import { cspDirectives } from "./csp";
describe("development CSP", () => {
  it("retains the nonce when enabling dev evaluation so Next can nonce its scripts", () => {
    const policy = cspDirectives({ nonce: "test-nonce", extra: { "script-src": ["'unsafe-eval'"] } });
    expect(policy["script-src"]).toContain("'nonce-test-nonce'");
    expect(policy["script-src"]).toContain("'strict-dynamic'");
    expect(policy["script-src-elem"]).toContain("'nonce-test-nonce'");
    expect(policy["script-src"]).toContain("'unsafe-eval'");
  });
  it("does not enable eval in production", () => expect(cspDirectives({ nonce: "test" })["script-src"]).not.toContain("'unsafe-eval'"));
});
