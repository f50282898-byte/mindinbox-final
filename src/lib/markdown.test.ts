import { describe, expect, it } from "vitest";
import {
  blocksToPlainText,
  inlineText,
  parseMarkdown,
  safeHref,
  type Inline,
} from "@/lib/markdown";

/**
 * Markdown parsing.
 *
 * The security property is the point: **no path may produce raw HTML**. Model
 * output is untrusted, and any route from that text into the DOM as markup is a
 * stored-XSS sink reachable from every replayed conversation.
 */

describe("safeHref", () => {
  it("accepts http, https and mailto", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("http://example.com/a")).toBe("http://example.com/a");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("rejects javascript:, data: and protocol-relative URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.example.com/path",
    ]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });

  it("strips trailing punctuation that is prose, not URL", () => {
    expect(safeHref("https://example.com/path.")).toBe("https://example.com/path");
    expect(safeHref("https://example.com/a)")).toBe("https://example.com/a");
  });
});

describe("parseMarkdown", () => {
  it("parses headings at the levels we support and ignores deeper ones", () => {
    const blocks = parseMarkdown("## عنوان\n### فرعي\n#### أعمق");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "heading", "paragraph"]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(blocks[1]).toMatchObject({ kind: "heading", level: 3 });
    // `####` is not a heading in this subset; it degrades to text.
    expect(blocks[2].kind).toBe("paragraph");
  });

  it("parses bold, emphasis and inline code", () => {
    const blocks = parseMarkdown("عادي **غامق** *مائل* `رمز`");
    expect(blocks[0].kind).toBe("paragraph");
    if (blocks[0].kind !== "paragraph") return;
    expect(blocks[0].inline.map((n) => n.kind)).toEqual([
      "text",
      "bold",
      "text",
      "em",
      "text",
      "code",
    ]);
  });

  it("treats snake_case as a word, not emphasis", () => {
    const blocks = parseMarkdown("user_id و some_var_name");
    expect(blocks[0].kind).toBe("paragraph");
    if (blocks[0].kind !== "paragraph") return;
    expect(blocks[0].inline.every((n) => n.kind === "text")).toBe(true);
    expect(inlineText(blocks[0].inline)).toContain("user_id");
  });

  it("parses bullet and ordered lists", () => {
    const bullets = parseMarkdown("- أول\n- ثانٍ");
    expect(bullets[0]).toMatchObject({ kind: "bullet" });
    if (bullets[0].kind !== "bullet") return;
    expect(bullets[0].items).toHaveLength(2);

    const ordered = parseMarkdown("1. أول\n2. ثانٍ");
    expect(ordered[0]).toMatchObject({ kind: "ordered" });
  });

  it("parses block quotes and rules", () => {
    expect(parseMarkdown("> اقتباس")[0]).toMatchObject({ kind: "quote" });
    expect(parseMarkdown("---")[0]).toMatchObject({ kind: "rule" });
    expect(parseMarkdown("***")[0]).toMatchObject({ kind: "rule" });
  });

  it("keeps fenced code literal, including markdown inside it", () => {
    const blocks = parseMarkdown("```\n**not bold**\n<script>x</script>\n```");
    expect(blocks[0].kind).toBe("code");
    if (blocks[0].kind !== "code") return;
    // The markers survive as literal characters. Nothing is interpreted.
    expect(blocks[0].text).toContain("**not bold**");
    expect(blocks[0].text).toContain("<script>");
  });

  it("converts a bare URL into a safe link", () => {
    const blocks = parseMarkdown("اقرأ https://example.com/a وترى");
    if (blocks[0].kind !== "paragraph") throw new Error("expected a paragraph");
    const link = blocks[0].inline.find((n) => n.kind === "link");
    expect(link).toBeDefined();
    if (link?.kind !== "link") return;
    expect(link.href).toBe("https://example.com/a");
  });

  it("leaves a javascript: URL as inert text", () => {
    const blocks = parseMarkdown(" javascript:alert(1)");
    if (blocks[0].kind !== "paragraph") throw new Error("expected a paragraph");
    expect(blocks[0].inline.every((n) => n.kind !== "link")).toBe(true);
    expect(inlineText(blocks[0].inline)).toContain("javascript:alert(1)");
  });

  /* ── the security property ─────────────────────────────────────────────── */

  it("never produces a node kind capable of carrying markup", () => {
    const hostile = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<iframe src='https://evil'></iframe>",
      "<style>body{display:none}</style>",
      "<svg/onload=alert(1)>",
      "[click](javascript:alert(1))",
      "![img](javascript:alert(1))",
      "<a href='javascript:alert(1)'>x</a>",
    ];

    const allowed = new Set(["text", "bold", "em", "code", "link"]);

    const inspect = (nodes: Inline[], input: string) => {
      for (const node of nodes) {
        expect(allowed.has(node.kind), `${input} → ${node.kind}`).toBe(true);
      }
    };

    for (const input of hostile) {
      for (const block of parseMarkdown(input)) {
        if (block.kind === "paragraph" || block.kind === "quote" || block.kind === "heading") {
          inspect(block.inline, input);
        }
        if (block.kind === "bullet" || block.kind === "ordered") {
          for (const item of block.items) inspect(item, input);
        }
      }
    }
  });

  it("round-trips hostile input to plain text without altering it", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const text = blocksToPlainText(parseMarkdown(hostile));
    // Present as characters the user can see, not as something that executes.
    expect(text).toContain("<img");
  });

  it("handles empty and whitespace-only input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });

  it("joins a wrapped paragraph into one line", () => {
    const blocks = parseMarkdown("هذا نص\nمكتوب على\nسطرين");
    expect(blocks).toHaveLength(1);
    if (blocks[0].kind !== "paragraph") return;
    expect(inlineText(blocks[0].inline)).toBe("هذا نص مكتوب على سطرين");
  });
});

describe("blocksToPlainText", () => {
  it("produces clipboard-ready text", () => {
    const text = blocksToPlainText(
      parseMarkdown("## عنوان\n\n- أول\n- ثانٍ\n\n> اقتباس\n\n---\n\nنهاية")
    );
    expect(text).toContain("عنوان");
    expect(text).toContain("· أول");
    expect(text).toContain("اقتباس");
    expect(text).toContain("—");
  });
});
