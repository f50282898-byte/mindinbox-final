import { expect, it } from "vitest";
import { verifyArabicCitation } from "./verify-citation";
it("distinguishes absent evidence from a false attribution and identifies translations", () => {
  expect(verifyArabicCitation("هل قال أفلاطون حرفياً: الصمت مرآة الغد؟")).toContain("لا أملك");
  expect(verifyArabicCitation("هل قال سقراط: لا أعلم، ولا أظن أني أعلم؟")).toContain("21d");
  expect(verifyArabicCitation("ماذا يعني الصمت عند أفلاطون؟")).toBeNull();
});
