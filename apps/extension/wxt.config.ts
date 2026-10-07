import { defineConfig } from "wxt";

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

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: () => ({
    name: "MindSpool",
    description: "Keep your links, images, and ideas together.",
    permissions: ["storage", "cookies"],
    // Firefox needs a fixed id for MV3 and for the Clerk origin allow-list.
    // Source: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings#id
    browser_specific_settings: { gecko: { id: "clipper@mindspool.local" } },
    host_permissions: [
      "*://x.com/*",
      "*://twitter.com/*",
      ...originPermission("WXT_PUBLIC_CLERK_FRONTEND_API"),
      ...originPermission("WXT_PUBLIC_CONVEX_URL"),
    ],
    ...(process.env.CLERK_EXTENSION_PUBLIC_KEY
      ? { key: process.env.CLERK_EXTENSION_PUBLIC_KEY }
      : {}),
  }),
});
