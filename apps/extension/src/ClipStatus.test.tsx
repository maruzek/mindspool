import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ClipStatus } from "./ClipStatus";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const host = document.createElement("div");
afterEach(() => {
  host.replaceChildren();
});

async function render(webUrl: string) {
  await act(async () =>
    createRoot(host).render(<ClipStatus webUrl={webUrl} />),
  );
}

describe("ClipStatus", () => {
  it("says clipping is on and links to the web app", async () => {
    await render("http://localhost:5173");
    expect(host.textContent).toContain("Clipping on x.com is on");
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("http://localhost:5173");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
