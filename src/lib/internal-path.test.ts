import { expect, it } from "vitest";
import { isInternalPath } from "./internal-path";

it("keeps configured navigation within the website", () => {
  for (const href of ["/\\outside.example", "//outside.example", "/\t/outside.example", "https://outside.example"]) {
    expect(isInternalPath(href)).toBe(false);
  }
  expect(isInternalPath("/wisdom?q=hello#question")).toBe(true);
});
