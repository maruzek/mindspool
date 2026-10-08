import { createClerkClient } from "@clerk/chrome-extension/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@mindspool/backend/api";
import { browser } from "wxt/browser";
import { createClipHandler } from "../src/clipHandler";
import { isClipRequest } from "../src/messages";
import { createTokenProvider } from "../src/tokenProvider";

// ESM output: Clerk's client uses dynamic imports, which WXT's default IIFE background cannot bundle.
// All runtime setup lives in `main`: WXT imports this file in Node at build time.
export default defineBackground({
  type: "module",
  main() {
    const publishableKey = import.meta.env.WXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const convexUrl = import.meta.env.WXT_PUBLIC_CONVEX_URL;
    const convex = convexUrl ? new ConvexHttpClient(convexUrl) : undefined;

    // Source: node_modules/@clerk/chrome-extension (3.1.90) marks `/background` deprecated in favour of
    // `/client` with `{ background: true }`.
    const getToken = createTokenProvider(() => {
      if (!publishableKey) throw new Error("Clerk is not configured");
      return createClerkClient({ publishableKey, background: true });
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
      // Only this extension's own scripts may clip.
      if (sender.id !== browser.runtime.id || !isClipRequest(message))
        return undefined;
      return handleClip(message);
    });
  },
});
