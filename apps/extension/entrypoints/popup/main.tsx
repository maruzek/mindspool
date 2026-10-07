import { createRoot } from "react-dom/client";
import {
  ClerkProvider,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/chrome-extension";
import { browser } from "wxt/browser";
import { WorkspaceShell } from "@mindspool/ui";
import { ClipStatus } from "../../src/ClipStatus";
import "./style.css";

const publishableKey = import.meta.env.WXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const frontendApi = import.meta.env.WXT_PUBLIC_CLERK_FRONTEND_API;
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
    <SignInButton mode="modal">
      <button>Sign in</button>
    </SignInButton>
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
      >
        <AuthControls />
      </ClerkProvider>
    ) : (
      <p>Sign-in is not configured for this environment.</p>
    )}
  </WorkspaceShell>,
);
