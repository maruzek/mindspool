import { expect, it } from "vitest";
import { pageContext, readRenderedPage } from "./pageContext";

it("uses the existing metadata fallback order and preserves separate preview provenance", () => {
  expect(
    pageContext(
      "https://example.com/entry#design",
      '<title>Fallback</title><meta property="og:title" content="Actual design"><meta property="og:image" content="/preview.png"><link rel="canonical" href="/canonical">',
    ),
  ).toMatchObject({
    sourceMetadata: { title: "Actual design" },
    canonicalUrl: "https://example.com/canonical",
    previewImageUrl: "https://example.com/preview.png",
  });
});
it("reads only bounded rendered head metadata and never serializes body input or scripts", () => {
  document.head.innerHTML =
    '<title>Rendered title</title><meta name="description" content="Description">';
  document.body.innerHTML =
    '<input value="private input"><script>private script</script>';
  const page = readRenderedPage();
  expect(page.head).toContain("Rendered title");
  expect(page.head).not.toContain("private");
  expect(page.head.length).toBeLessThanOrEqual(32_768);
  document.title = "Changed SPA title";
  expect(readRenderedPage().title).toBe("Changed SPA title");
});
it("trims parser output to capture bounds and omits temporary/unsafe URLs", () => {
  const context = pageContext(
    "https://example.com",
    `<meta property="og:title" content="${"a".repeat(500)}"><meta property="og:image" content="blob:https://example.com/expired">`,
  );
  expect(context.sourceMetadata?.title?.length).toBe(300);
  expect(context.previewImageUrl).toBeUndefined();
  expect(pageContext("https://example.com", "")).toEqual({});
});
