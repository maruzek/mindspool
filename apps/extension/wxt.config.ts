import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: () => ({
    name: "MindSpool",
    description: "Keep your links, images, and ideas together.",
    permissions: ["storage", "cookies"],
    host_permissions: process.env.WXT_PUBLIC_CLERK_FRONTEND_API
      ? [`${new URL(process.env.WXT_PUBLIC_CLERK_FRONTEND_API).origin}/*`]
      : [],
    ...(process.env.CLERK_EXTENSION_PUBLIC_KEY
      ? { key: process.env.CLERK_EXTENSION_PUBLIC_KEY }
      : {}),
  }),
});
