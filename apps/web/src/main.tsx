import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { App } from "./App";
import "./style.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : undefined;
const app = <App authConfigured={Boolean(publishableKey)} />;

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
