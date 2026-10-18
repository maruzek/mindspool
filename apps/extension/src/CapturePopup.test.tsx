import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CapturePopup } from "./CapturePopup";
import type { VisualCaptureRequest } from "./visualCapture";
import { browser } from "wxt/browser";

vi.mock("wxt/browser", () => ({
  browser: {
    permissions: { request: vi.fn(async () => true) },
    runtime: { sendMessage: vi.fn() },
    tabs: {
      query: async () => [{ title: "Fixture", url: "https://example.com" }],
    },
  },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const host = document.createElement("div");
afterEach(async () => {
  await act(async () => root?.unmount());
  host.replaceChildren();
  vi.clearAllMocks();
});
async function render(
  auth: "signed_in" | "signed_out",
  send = async (_request: VisualCaptureRequest) => ({ state: "idle" }),
) {
  root = createRoot(host);
  await act(async () =>
    root.render(
      <CapturePopup
        auth={auth}
        webUrl="https://mindspool.example"
        send={send}
      />,
    ),
  );
}
it("leads with capture controls and coalesces a rapid double click", async () => {
  let starts = 0;
  await render("signed_in", async (request) => {
    if (request.type === "start-visual-capture") {
      starts++;
      return { state: "capturing" };
    }
    return { state: "idle" };
  });
  const button = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Capture visible area"),
  )!;
  expect(button).toBeTruthy();
  await act(async () => {
    button.click();
    button.click();
  });
  expect(starts).toBe(1);
});
it("offers sign-in without actionable capture controls while signed out", async () => {
  await render("signed_out");
  expect(host.textContent).toContain("Sign in to capture");
  expect(host.querySelector("button")).toBeNull();
});
it("reads a completed background operation when reopened", async () => {
  await render("signed_in", async () => ({ state: "saved", itemId: "item-1" }));
  expect(host.textContent).toContain("Saved to your library");
  expect(host.querySelector('a[href*="item-1"]')).not.toBeNull();
});
it("requests only the selected image origin after an explicit click", async () => {
  const send = vi.fn(async (_request: VisualCaptureRequest) => ({
    state: "failed",
    error: "permission_denied",
    permissionOrigin: "https://images.example",
  }));
  await render("signed_in", send);
  expect(browser.permissions.request).not.toHaveBeenCalled();
  const button = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Allow image download"),
  )!;
  await act(async () => button.click());
  expect(browser.permissions.request).toHaveBeenCalledWith({
    origins: ["https://images.example/*"],
  });
  expect(send).toHaveBeenCalledWith({ type: "retry-image-capture" });
});
