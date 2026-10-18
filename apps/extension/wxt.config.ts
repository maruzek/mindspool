import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

const originPermission = (name: string) => {
  const value = process.env[name];
  if (!value) return [];
  try {
    return [`${new URL(value).origin}/*`];
  } catch {
    // The value is deliberately not printed.
    throw new Error(
      `${name} must be a full URL such as https://example.com (check for a missing https://, quotes or spaces)`,
    );
  }
};
const captureHttpPermission = () => {
  const url =
    process.env.WXT_PUBLIC_CONVEX_HTTP_URL ??
    process.env.WXT_PUBLIC_CONVEX_URL?.replace(
      /\.convex\.cloud\/?$/,
      ".convex.site",
    );
  return url ? [`${new URL(url).origin}/*`] : [];
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Vite's modulepreload links trigger "cross-world extension resource
  // mismatch" warnings in extension pages and gain nothing from local files.
  vite: () => ({ plugins: [tailwindcss()], build: { modulePreload: false } }),
  manifest: ({ browser }) => ({
    name: "MindSpool",
    description: "Keep your links, images, and ideas together.",
    permissions: [
      "storage",
      "alarms",
      "cookies",
      "activeTab",
      "scripting",
      "contextMenus",
      ...(browser === "chrome" ? ["offscreen"] : []),
      ...(browser === "firefox" ? ["webRequest", "webRequestBlocking"] : []),
    ],
    // Firefox needs a fixed id for MV3 and for the Clerk origin allow-list.
    // Source: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings#id
    browser_specific_settings: {
      gecko: {
        id: "clipper@mindspool.local",
        // Clips (page text and images) go to the owner's Convex backend, with the Clerk session token.
        // Source: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
        data_collection_permissions: {
          required: ["websiteContent", "authenticationInfo"],
        },
      },
    },
    host_permissions: [
      "*://x.com/*",
      "*://twitter.com/*",
      "*://reddit.com/*",
      "*://www.reddit.com/*",
      ...originPermission("WXT_PUBLIC_CLERK_FRONTEND_API"),
      ...originPermission("WXT_PUBLIC_CONVEX_URL"),
      ...captureHttpPermission(),
      ...originPermission("WXT_PUBLIC_CLERK_SYNC_HOST"),
    ],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    // `key` pins the Chrome extension ID; Firefox rejects the property.
    ...(browser !== "firefox" && process.env.CLERK_EXTENSION_PUBLIC_KEY
      ? { key: process.env.CLERK_EXTENSION_PUBLIC_KEY }
      : {}),
  }),
});
