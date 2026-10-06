import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "./router";
import "@mindspool/ui/globals.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : undefined;
const router = createAppRouter({
  authConfigured: Boolean(publishableKey),
  backendConfigured: Boolean(convex),
});
const app = <RouterProvider router={router} />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey}>
        {convex ? (
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            {app}
          </ConvexProviderWithClerk>
        ) : (
          app
        )}
      </ClerkProvider>
    ) : (
      app
    )}
  </StrictMode>,
);
