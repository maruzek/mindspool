import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandIcon } from "./BrandIcon";
import { brandOf, hostOf } from "./itemDisplay";

// Keep in sync with SOURCE_FIXTURES in packages/backend/convex/itemState.test.ts:
// the backend `sourceKindOf` and this host map must classify every URL the same way.
const SOURCE_FIXTURES: [string, string][] = [
  ["https://x.com/a/status/1", "x"],
  ["https://twitter.com/a", "x"],
  ["https://mobile.twitter.com/a", "x"],
  ["https://www.instagram.com/p/abc", "instagram"],
  ["https://www.tiktok.com/@a/video/1", "tiktok"],
  ["https://vm.tiktok.com/abc", "tiktok"],
  ["https://www.youtube.com/watch?v=1", "youtube"],
  ["https://m.youtube.com/watch?v=1", "youtube"],
  ["https://youtu.be/1", "youtube"],
  ["https://www.reddit.com/r/a", "reddit"],
  ["https://old.reddit.com/r/a", "reddit"],
  ["https://redd.it/abc", "reddit"],
  ["https://example.com/x.com", "web"],
  ["https://notx.com/a", "web"],
  ["https://fakeyoutu.be/1", "web"],
];

afterEach(cleanup);
describe("BrandIcon", () => {
  it("renders a brand mark with currentColor", () => {
    const { container } = render(<BrandIcon host="youtu.be" kind="link" />);
    const svg = container.querySelector("svg[data-brand='youtube']")!;
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.querySelector("path")!.getAttribute("d")).toMatch(/^M/);
  });
  it("falls back to a globe for other hosts and a note icon for notes", () => {
    const globe = render(<BrandIcon host="example.com" kind="link" />);
    expect(globe.container.querySelector("[data-brand]")).toBeNull();
    expect(globe.container.querySelector("svg")).not.toBeNull();
    cleanup();
    const note = render(<BrandIcon host={null} kind="note" />);
    expect(note.container.querySelector("svg")).not.toBeNull();
  });
  it.each(SOURCE_FIXTURES)(
    "classifies %s as %s like the backend",
    (url, kind) => {
      expect(brandOf(hostOf(url)) ?? "web").toBe(kind);
    },
  );
});
