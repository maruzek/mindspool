import { createRoot } from "react-dom/client";
import { ClerkProvider, UserButton, useAuth } from "@clerk/chrome-extension";
import { browser } from "wxt/browser";
import { WorkspaceShell } from "@mindspool/ui";
import { ClipStatus } from "../../src/ClipStatus";
import "./style.css";

const publishableKey = import.meta.env.WXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const frontendApi = import.meta.env.WXT_PUBLIC_CLERK_FRONTEND_API;
// Google sign-in cannot run in a Chrome popup, so the session is read from the
// web app's Clerk cookie (the user signs in on the web app).
const syncHost = import.meta.env.WXT_PUBLIC_CLERK_SYNC_HOST;
const webUrl = import.meta.env.WXT_PUBLIC_WEB_URL || "http://localhost:5173";
const popupUrl = browser.runtime.getURL("/popup.html");

function AuthControls() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p role="status">Loading sign-in…</p>;
  return isSignedIn ? (
    <>
      <UserButton />
      <ClipStatus webUrl={webUrl} />
    </>
  ) : (
    <a href={webUrl} target="_blank" rel="noreferrer">
      Sign in on MindSpool, then reopen this popup
    </a>
  );
}

createRoot(document.getElementById("root")!).render(
  <WorkspaceShell>
    {publishableKey && frontendApi ? (
      <ClerkProvider
        publishableKey={publishableKey}
        afterSignOutUrl={popupUrl}
        signInFallbackRedirectUrl={popupUrl}
        signUpFallbackRedirectUrl={popupUrl}
        syncHost={syncHost}
      >
        <AuthControls />
      </ClerkProvider>
    ) : (
      <p>Sign-in is not configured for this environment.</p>
    )}
  </WorkspaceShell>,
);
