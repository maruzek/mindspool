import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";
import { WorkspaceShell } from "@mindspool/ui";

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

export function App({ authConfigured }: { authConfigured: boolean }) {
  return (
    <WorkspaceShell>
      {authConfigured ? (
        <AuthControls />
      ) : (
        <p>Sign-in is not configured for this environment.</p>
      )}
      <section className="empty-state">
        <h2>Your collection starts here.</h2>
        <p>A home for the links, images, and ideas you want to keep.</p>
      </section>
    </WorkspaceShell>
  );
}
