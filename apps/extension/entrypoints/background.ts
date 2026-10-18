import { createClerkClient } from "@clerk/chrome-extension/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@mindspool/backend/api";
import { browser } from "wxt/browser";
import { createClipHandler } from "../src/clipHandler";
import { isClipRequest } from "../src/messages";
import { createTokenProvider } from "../src/tokenProvider";
import { clerkRequestHeaders } from "../src/clerkRequestHeaders";
import { browserVisualCapture } from "../src/browserVisualCapture";
import { isVisualCaptureRequest } from "../src/visualCapture";

// ESM output: Clerk's client uses dynamic imports, which WXT's default IIFE background cannot bundle.
// All runtime setup lives in `main`: WXT imports this file in Node at build time.
export default defineBackground({
  type: "module",
  main() {
    const publishableKey = import.meta.env.WXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const syncHost = import.meta.env.WXT_PUBLIC_CLERK_SYNC_HOST;
    const frontendApi = import.meta.env.WXT_PUBLIC_CLERK_FRONTEND_API;
    const convexUrl = import.meta.env.WXT_PUBLIC_CONVEX_URL;
    const convex = convexUrl ? new ConvexHttpClient(convexUrl) : undefined;

    // Register synchronously so this also covers requests that wake the event page.
    // Firefox MV3 supports blocking webRequest; Chrome MV3 does not.
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeSendHeaders
    if (import.meta.env.BROWSER === "firefox" && frontendApi) {
      const extensionUrl = browser.runtime.getURL("/");
      browser.webRequest.onBeforeSendHeaders.addListener(
        (details) => clerkRequestHeaders(details, extensionUrl, frontendApi),
        { urls: [`${new URL(frontendApi).origin}/*`] },
        ["blocking", "requestHeaders"],
      );
    }

    // Source: node_modules/@clerk/chrome-extension (3.1.90) marks `/background` deprecated in favour of
    // `/client` with `{ background: true }`.
    const getToken = createTokenProvider(() => {
      if (!publishableKey) throw new Error("Clerk is not configured");
      return createClerkClient({ publishableKey, syncHost, background: true });
    });

    const visualCapture = browserVisualCapture(getToken);
    browser.contextMenus.create(
      {
        id: "mindspool-save-image",
        title: "Save image to MindSpool",
        contexts: ["image"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      },
      () => {
        void browser.runtime.lastError;
      },
    );
    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (
        info.menuItemId !== "mindspool-save-image" ||
        !info.srcUrl ||
        tab?.id === undefined ||
        !tab.url
      )
        return;
      const targetElementId =
        "targetElementId" in info && typeof info.targetElementId === "number"
          ? info.targetElementId
          : undefined;
      const target = {
        tabId: tab.id,
        windowId: tab.windowId,
        pageUrl: info.pageUrl ?? tab.url,
        srcUrl: info.srcUrl,
        frameId: info.frameId,
        ...(targetElementId !== undefined ? { targetElementId } : {}),
      };
      void visualCapture.ready.then(() => visualCapture.start("image", target));
    });
    const handleClip = createClipHandler({
      getToken,
      client: {
        setAuth: (token) => convex?.setAuth(token),
        createItem: (args) => {
          if (!convex) throw new Error("Convex is not configured");
          return convex.mutation(api.items.create, args);
        },
        clipReddit: (args) => {
          if (!convex) throw new Error("Convex is not configured");
          return convex.mutation(api.items.clipReddit, args);
        },
      },
    });

    browser.runtime.onMessage.addListener((message: unknown, sender) => {
      if (
        sender.id === browser.runtime.id &&
        sender.url?.startsWith(browser.runtime.getURL("/")) &&
        isVisualCaptureRequest(message)
      ) {
        return visualCapture.ready.then(() => {
          if (message.type === "start-visual-capture")
            return visualCapture.start(message.kind);
          if (message.type === "retry-image-capture")
            visualCapture.retryImage();
          if (message.type === "retry-visual-capture") visualCapture.retry();
          if (message.type === "cancel-visual-capture") visualCapture.cancel();
          return visualCapture.status();
        });
      }
      // Only this extension's own scripts may clip.
      if (sender.id !== browser.runtime.id || !isClipRequest(message))
        return undefined;
      return handleClip(message);
    });
  },
});
