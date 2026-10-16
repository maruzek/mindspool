import { describe, expect, it } from "vitest";
import { parseMetadata } from "./pageMetadata";

const article = `<!doctype html><html><head>
<meta charset="utf-8">
<title>Fallback title</title>
<meta property="og:title" content="How soup works &amp; why">
<meta property="og:description" content="A   long
 read about &quot;soup&quot;">
<meta property="og:site_name" content="The Kitchen">
<meta property="og:image" content="https://cdn.example.com/soup.jpg">
<meta name="author" content="Ada">
<link rel="canonical" href="https://example.com/soup">
</head><body><meta property="og:image" content="https://evil.example/late.png"></body></html>`;

describe("parseMetadata", () => {
  it("reads a typical article", () => {
    expect(parseMetadata(article, "https://example.com/soup?utm=1")).toEqual({
      title: "How soup works & why",
      description: 'A long read about "soup"',
      siteName: "The Kitchen",
      author: "Ada",
      canonicalUrl: "https://example.com/soup",
      image: "https://cdn.example.com/soup.jpg",
    });
  });

  it("reads a GitHub repository page", () => {
    const html = `<head><title>GitHub - a/b: A tool</title>
<meta name="description" content="A tool. Contribute to a/b development.">
<meta property="og:image" content="https://opengraph.githubassets.com/x/a/b">
<meta property="og:url" content="https://github.com/a/b">
<meta property="og:site_name" content="GitHub"></head>`;
    expect(parseMetadata(html, "https://github.com/a/b")).toMatchObject({
      title: "GitHub - a/b: A tool",
      description: "A tool. Contribute to a/b development.",
      siteName: "GitHub",
      canonicalUrl: "https://github.com/a/b",
      image: "https://opengraph.githubassets.com/x/a/b",
    });
  });

  it("reads a YouTube page with twitter tags and reversed attributes", () => {
    const html = `<head>
<meta content='Cat video' name='twitter:title'>
<meta content=https://i.ytimg.com/vi/1/maxresdefault.jpg name=twitter:image>
<meta content="Funny cat" property="og:description"></head>`;
    expect(parseMetadata(html, "https://www.youtube.com/watch?v=1")).toEqual({
      title: "Cat video",
      description: "Funny cat",
      image: "https://i.ytimg.com/vi/1/maxresdefault.jpg",
    });
  });

  it("falls back to <title> alone", () => {
    expect(
      parseMetadata(
        "<html><head><title>\n Just  a title </title>",
        "https://a.b/",
      ),
    ).toEqual({ title: "Just a title" });
  });

  it("prefers og:image over twitter:image and falls back to secure_url", () => {
    const both = `<meta name="twitter:image" content="/t.png"><meta property="og:image" content="/o.png">`;
    expect(parseMetadata(both, "https://a.b/x/y").image).toBe(
      "https://a.b/o.png",
    );
    const secure = `<meta property="og:image:secure_url" content="https://a.b/s.png">`;
    expect(parseMetadata(secure, "https://a.b/").image).toBe(
      "https://a.b/s.png",
    );
  });

  it("resolves relative URLs and drops unsafe schemes", () => {
    expect(
      parseMetadata(
        `<meta property="og:image" content="/a.png">`,
        "https://a.b/x/y",
      ).image,
    ).toBe("https://a.b/a.png");
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA"])
      expect(
        parseMetadata(
          `<meta property="og:image" content="${bad}">`,
          "https://a.b/",
        ).image,
      ).toBeUndefined();
  });

  it("ignores commented-out tags", () => {
    expect(
      parseMetadata(
        `<!-- <meta property="og:title" content="Old"> --><title>New</title>`,
        "https://a.b/",
      ).title,
    ).toBe("New");
  });

  it("does not throw on malformed input", () => {
    for (const html of [
      "",
      "<<<>>>",
      "<meta",
      '<meta property="og:title" content="unterminated',
      "<title>no close",
      "<meta property=og:image content=>",
      "&#99999999; &#xZZ; &bogus;",
    ])
      expect(() => parseMetadata(html, "https://a.b/")).not.toThrow();
  });

  it("truncates long values", () => {
    const html = `<meta property="og:description" content="${"x".repeat(5000)}">`;
    expect(parseMetadata(html, "https://a.b/").description).toHaveLength(2000);
  });

  it("keeps a > inside a quoted attribute", () => {
    const html = `<meta property="og:title" content="A > B"><meta property="og:image" content="https://a.b/i.png?x=>y">`;
    expect(parseMetadata(html, "https://a.b/")).toMatchObject({
      title: "A > B",
      image: "https://a.b/i.png?x=%3Ey",
    });
  });

  it("ignores markup inside scripts and styles", () => {
    const html = `<head><script>const t = \`<meta property="og:title" content="Fake">\`;</script>
<style>/* <meta property="og:title" content="Style"> */</style>
<meta property="og:title" content="Real"></head>`;
    expect(parseMetadata(html, "https://a.b/").title).toBe("Real");
  });
});
