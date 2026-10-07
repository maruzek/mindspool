import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandIcon } from "./BrandIcon";

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
});
