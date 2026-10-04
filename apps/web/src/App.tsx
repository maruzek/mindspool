import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";
import { WorkspaceShell } from "@mindspool/ui";
import { CaptureSession } from "./CaptureSession";
import { useEffect } from "react";
import { clearOtherDrafts } from "./captureDraft";

function AuthenticatedLibrary() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const sessionKey = isSignedIn ? `${userId}:${sessionId}` : null;
  useEffect(() => {
    if (isLoaded) clearOtherDrafts(sessionKey);
  }, [isLoaded, sessionKey]);
  if (!isLoaded) return <p role="status">Connecting to your library…</p>;
  if (!isSignedIn) return <p>Sign in to save and organize your items.</p>;
  if (!sessionKey) return null;
  return <CaptureSession key={sessionKey} sessionKey={sessionKey} />;
}

function AuthControls() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p role="status">Loading sign-in…</p>;
  return isSignedIn ? (
    <UserButton />
  ) : (
    <nav aria-label="Account">
      <SignInButton mode="modal">
        <button>Sign in</button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button>Create account</button>
      </SignUpButton>
    </nav>
  );
}

export function App({
  authConfigured,
  backendConfigured,
}: {
  authConfigured: boolean;
  backendConfigured: boolean;
}) {
  return (
    <WorkspaceShell>
      {authConfigured ? (
        <AuthControls />
      ) : (
        <p>Sign-in is not configured for this environment.</p>
      )}
      {authConfigured && backendConfigured ? (
        <AuthenticatedLibrary />
      ) : (
        <section className="empty-state">
          <h2>Your library starts here.</h2>
          <p>A home for the links, images, and ideas you want to keep.</p>
          {authConfigured && !backendConfigured && (
            <p>Library connection is not configured for this environment.</p>
          )}
        </section>
      )}
    </WorkspaceShell>
  );
}
