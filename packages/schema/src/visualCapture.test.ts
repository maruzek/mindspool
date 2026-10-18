import { describe, expect, it } from "vitest";
import { assertCaptureContext, VISUAL_LIMITS } from "./visualCapture";

const context = {
  captureKey: "visual:61363ee8-23cc-4cb6-b827-9c39c694af38",
  kind: "viewport" as const,
  pageUrl: "https://example.com/design#pricing",
  capturedAt: 1000,
};

describe("visual capture context", () => {
  it("preserves the browsing URL independently of canonical metadata", () => {
    expect(() =>
      assertCaptureContext({
        ...context,
        canonicalUrl: "https://example.com/",
      }),
    ).not.toThrow();
    expect(context.pageUrl).toContain("#pricing");
    expect(VISUAL_LIMITS.bytes).toBe(2_097_152);
  });
  it.each([
    "javascript:alert(1)",
    "data:image/png,abc",
    "blob:https://example.com/abc",
    "https://user:pass@example.com",
    "file:///tmp/image.png",
  ])("rejects unsafe provenance %s", (url) => {
    expect(() => assertCaptureContext({ ...context, pageUrl: url })).toThrow();
    expect(() =>
      assertCaptureContext({ ...context, sourceImageUrl: url }),
    ).toThrow();
  });
  it("bounds metadata, timestamps, capture identities and kinds", () => {
    for (const patch of [
      { capturedAt: NaN },
      { capturedAt: -1 },
      { capturedAt: Date.now() + 600_000 },
      { kind: "video" },
      { captureKey: "visual:not-a-uuid" },
      { sourceMetadata: { title: "x".repeat(301) } },
      { sourceMetadata: { description: "x".repeat(1001) } },
    ])
      expect(() => assertCaptureContext({ ...context, ...patch })).toThrow();
  });
});
