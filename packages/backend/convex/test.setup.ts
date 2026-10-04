/// <reference types="vite/client" />

// https://docs.convex.dev/testing/convex-test#initialize-convextest
export const modules = import.meta.glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);
