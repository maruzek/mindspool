import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";
import { WorkspaceShell } from "@mindspool/ui";
import { useConvexAuth } from "convex/react";
import { Component } from "react";
import type { ReactNode } from "react";
import { Workspace } from "./Workspace";

class LibraryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section role="alert">
          <p>Your library could not load. Try reconnecting.</p>
          <button onClick={() => window.location.reload()}>Reconnect</button>
        </section>
      );
    return this.props.children;
  }
}

function AuthenticatedLibrary() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded || isLoading)
    return <p role="status">Connecting to your library…</p>;
  if (!isSignedIn) return <p>Sign in to save and organize your items.</p>;
  if (!isAuthenticated)
    return (
      <p role="alert">
        Your session could not connect to your library. Try signing out and back
        in.
      </p>
    );
  // Convex must verify the token before any data hook mounts.
  // https://docs.convex.dev/auth/clerk
  return (
    <LibraryBoundary key={`${userId}:${sessionId}`}>
      <Workspace />
    </LibraryBoundary>
  );
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
