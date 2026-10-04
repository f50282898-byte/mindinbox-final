import { describe, expect, it } from "vitest";
import { toNoCookieEmbedUrl, isCanonicalEmbedUrl, ALLOWED_VIDEO_HOSTS } from "@/lib/admin/youtube";

/**
 * YouTube link validation.
 *
 * The acceptance criterion is a refusal: a link on a domain that is not allowed must
 * be rejected. So most of these are refusals, and the interesting cases are the ones
 * that *look* like YouTube.
 */

describe("accepted links", () => {
  const CASES: Array<[string, string, string]> = [
    // input, expected videoId, note
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "the canonical watch link"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "no www"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", "short link"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "dQw4w9WgXcQ", "short link with a timestamp"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", "already an embed"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", "shorts"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "mobile host"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ", "live"],
  ];

  for (const [input, videoId, note] of CASES) {
    it(`accepts ${note}`, () => {
      const result = toNoCookieEmbedUrl(input);
      expect(result.ok, `${input} should be accepted`).toBe(true);
      expect(result.ok && result.videoId).toBe(videoId);
    });
  }

  it("always emits the nocookie host, whatever came in", () => {
    // The point of the module: a reader's cookies are not handed to YouTube.
    for (const [input] of CASES) {
      const result = toNoCookieEmbedUrl(input);
      expect(result.ok && result.embedUrl).toMatch(
        /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/
      );
    }
  });

  it("never emits the host it was given", () => {
    const result = toNoCookieEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.ok && result.embedUrl.includes("www.youtube.com/")).toBe(false);
  });

  it("recognises its own output as canonical", () => {
    // Idempotence. Without this a stored `embedUrl` could never be re-checked on
    // read, which is the whole reason the read path calls this function.
    const first = toNoCookieEmbedUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(first.ok && isCanonicalEmbedUrl(first.embedUrl)).toBe(true);

    const second = toNoCookieEmbedUrl(first.ok ? first.embedUrl : "");
    expect(second.ok && second.embedUrl).toBe(first.ok ? first.embedUrl : null);
  });

  it("still refuses the look-alike that appends to the nocookie host", () => {
    expect(toNoCookieEmbedUrl("https://www.youtube-nocookie.com.evil.example/embed/dQw4w9WgXcQ").ok).toBe(
      false
    );
  });

  it("refuses the bare nocookie host without www", () => {
    // Strict on purpose: only the exact host we emit.
    expect(toNoCookieEmbedUrl("https://youtube-nocookie.com/embed/dQw4w9WgXcQ").ok).toBe(false);
  });
});

describe("refused links", () => {
  const REFUSED: Array<[string, string]> = [
    // The classic allow-list bug: a substring match on "youtube".
    ["https://notyoutube.com/watch?v=dQw4w9WgXcQ", "notyoutube.com"],
    ["https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "youtube.com.evil.example"],
    ["https://evil-youtube.example/embed/dQw4w9WgXcQ", "evil-youtube.example"],
    ["https://myyoutube.co/watch?v=dQw4w9WgXcQ", "myyoutube.co"],
    ["https://youtube-nocookie.com.evil.example/embed/dQw4w9WgXcQ", "suffix attack"],
  ];

  for (const [input, host] of REFUSED) {
    it(`refuses ${host}`, () => {
      const result = toNoCookieEmbedUrl(input);
      expect(result.ok, `${input} must be refused`).toBe(false);
      expect(!result.ok && result.reason).toBe("host_not_allowed");
    });
  }

  it("refuses a look-alike that ends with the real domain", () => {
    // `.endsWith("youtube.com")` would pass this. It must not.
    const result = toNoCookieEmbedUrl("https://wwwnotyoutube.com/watch?v=dQw4w9WgXcQ");
    expect(result.ok).toBe(false);
  });

  it("refuses a subdomain of an allowed domain that is not itself allowed", () => {
    // Deliberately strict: an allow-list of exact hosts, not a suffix rule. A new
    // YouTube subdomain should be added deliberately, not inherited by accident.
    const result = toNoCookieEmbedUrl("https://attacker.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.ok).toBe(false);
  });

  it("refuses javascript:", () => {
    const result = toNoCookieEmbedUrl("javascript:alert(1)");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("scheme");
  });

  it("refuses data:", () => {
    expect(toNoCookieEmbedUrl("data:text/html,<script>alert(1)</script>").ok).toBe(false);
  });

  it("refuses plain http", () => {
    // A downgrade would let a network attacker swap the video.
    expect(toNoCookieEmbedUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ").ok).toBe(false);
  });

  it("refuses an empty string and whitespace", () => {
    expect(toNoCookieEmbedUrl("").ok).toBe(false);
    expect(toNoCookieEmbedUrl("   ").ok).toBe(false);
  });

  it("refuses something that is not a URL", () => {
    expect(toNoCookieEmbedUrl("just some text").ok).toBe(false);
  });

  it("refuses an allowed host with no video id", () => {
    expect(toNoCookieEmbedUrl("https://www.youtube.com/").ok).toBe(false);
    expect(toNoCookieEmbedUrl("https://www.youtube.com/watch").ok).toBe(false);
    expect(toNoCookieEmbedUrl("https://youtu.be/").ok).toBe(false);
  });

  it("refuses a video id of the wrong length", () => {
    expect(toNoCookieEmbedUrl("https://www.youtube.com/watch?v=short").ok).toBe(false);
    expect(toNoCookieEmbedUrl("https://www.youtube.com/watch?v=waaaaaytoolongid").ok).toBe(false);
  });

  it("refuses a video id carrying characters outside the alphabet", () => {
    // Not escaped — refused. An id that needs escaping is not an id.
    expect(toNoCookieEmbedUrl("https://www.youtube.com/watch?v=abc/../../evil").ok).toBe(false);
    expect(toNoCookieEmbedUrl("https://www.youtube.com/watch?v=abc%22onload").ok).toBe(false);
  });

  it("does not accept a second v parameter that differs from the first", () => {
    // `searchParams.get` takes the first. That is deterministic, which is all that is
    // required — the id is still validated against the alphabet either way.
    const result = toNoCookieEmbedUrl("https://www.youtube.com/watch?v=bad&v=dQw4w9WgXcQ");
    expect(result.ok).toBe(false);
  });
});

describe("the exported host list", () => {
  it("names only the two documented domains, their mobile variants, and its own output", () => {
    expect([...ALLOWED_VIDEO_HOSTS].sort()).toEqual(
      [
        "m.youtube.com",
        "www.youtube-nocookie.com",
        "www.youtube.com",
        "www.youtu.be",
        "youtu.be",
        "youtube.com",
      ].sort()
    );
  });

  it("contains no wildcard and no suffix pattern", () => {
    // A `*` here would mean someone intends a wildcard rule; the implementation does
    // not support one, so the list must not imply it.
    for (const host of ALLOWED_VIDEO_HOSTS) {
      expect(host.includes("*")).toBe(false);
      expect(host.startsWith(".")).toBe(false);
    }
  });
});
