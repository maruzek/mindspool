import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { NotFound } from "../shell/NotFound";
import { AuthGate } from "../shell/AuthGate";
import type { RuntimeConfig } from "../shell/AuthGate";

export const Route = createRootRouteWithContext<RuntimeConfig>()({
  component: RootLayout,
  notFoundComponent: () => (
    <main>
      <NotFound />
    </main>
  ),
});

function RootLayout() {
  const { authConfigured, backendConfigured } = Route.useRouteContext();
  return (
    <AuthGate
      authConfigured={authConfigured}
      backendConfigured={backendConfigured}
    >
      <Outlet />
    </AuthGate>
  );
}
