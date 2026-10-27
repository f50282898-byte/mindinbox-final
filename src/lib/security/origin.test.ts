import { describe, it, expect } from "vitest";
import { verifySameOrigin } from "./origin";
const req = (origin: string, extra = {}) => new Request("https://app.pages.dev/api/ai", { method: "POST", headers: { origin, ...extra } });
describe("origin boundary", () => {
 it("accepts only the complete request origin", () => {
  expect(verifySameOrigin(req("https://app.pages.dev"))).toBe(true);
  expect(verifySameOrigin(req("https://attacker.pages.dev"))).toBe(false);
  expect(verifySameOrigin(req("http://app.pages.dev"))).toBe(false);
 });
 it("does not trust forwarded host or malformed origins", () => {
  expect(verifySameOrigin(req("https://evil.test", { "x-forwarded-host": "evil.test" }))).toBe(false);
  expect(verifySameOrigin(req("null"))).toBe(false);
 });
 it("rejects cross-site fetches without an origin", () => {
  expect(verifySameOrigin(new Request("https://app.pages.dev/api/ai", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).toBe(false);
 });
});
