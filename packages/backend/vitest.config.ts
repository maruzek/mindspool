import { defineConfig } from "vitest/config";

// https://docs.convex.dev/testing/convex-test#get-started
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
  },
});
