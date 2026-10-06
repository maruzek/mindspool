import { createRouter } from "@tanstack/react-router";
import type { RuntimeConfig } from "./shell/AuthGate";
import { routeTree } from "./routeTree.gen";

export function createAppRouter(
  context: RuntimeConfig,
  history?: Parameters<typeof createRouter>[0]["history"],
) {
  return createRouter({ routeTree, history, context });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
