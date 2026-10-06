import { useEffect } from "react";
import type { ReactNode } from "react";
import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useConvexAuth } from "convex/react";
import { Button } from "@mindspool/ui/components/button";
import { Textarea } from "@mindspool/ui/components/textarea";
import { clearOtherDrafts } from "../capture/captureDraft";
import {
  CaptureDraftProvider,
  useCaptureDraftContext,
} from "../capture/CaptureDraftProvider";
import { LibraryBoundary } from "./LibraryBoundary";
import { StateNotice } from "./StateNotice";

export interface RuntimeConfig {
  authConfigured: boolean;
  backendConfigured: boolean;
}

function ConvexGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { draft } = useCaptureDraftContext();
  if (isLoading)
    return <StateNotice role="status" title="Connecting to your library…" />;
  if (!isAuthenticated)
    return (
      <StateNotice role="alert" title="Your library is disconnected">
        <p>
          Your session could not connect to your library. Reconnect to try
          again; your unsaved input is kept.
        </p>
        {draft.originalInput && (
          <label className="flex w-full flex-col gap-1 text-sm">
            Unsaved input
            <Textarea readOnly value={draft.originalInput} rows={4} />
          </label>
        )}
        <Button onClick={() => window.location.reload()}>Reconnect</Button>
      </StateNotice>
    );
  // Data hooks mount only after Convex verifies the token.
  // https://docs.convex.dev/auth/clerk
  return <LibraryBoundary>{children}</LibraryBoundary>;
}

function SignedInGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const sessionKey = isSignedIn ? `${userId}:${sessionId}` : null;
  useEffect(() => {
    if (isLoaded) clearOtherDrafts(sessionKey);
  }, [isLoaded, sessionKey]);
  if (!isLoaded) return <StateNotice role="status" title="Loading sign-in…" />;
  if (!sessionKey)
    return (
      <StateNotice role="status" title="Sign in to your library">
        <p>Sign in to save and organize your items.</p>
        <div className="flex gap-2">
          <SignInButton mode="modal">
            <Button>Sign in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="secondary">Create account</Button>
          </SignUpButton>
        </div>
      </StateNotice>
    );
  // Remount on account or session change so the old draft is dropped.
  return (
    <CaptureDraftProvider key={sessionKey} sessionKey={sessionKey}>
      <ConvexGate>{children}</ConvexGate>
    </CaptureDraftProvider>
  );
}

/** Mounts the app only for a signed-in user whose Convex token is verified. */
export function AuthGate({
  authConfigured,
  backendConfigured,
  children,
}: RuntimeConfig & { children: ReactNode }) {
  if (!authConfigured)
    return (
      <StateNotice role="status" title="Sign-in is not configured">
        <p>Sign-in is not configured for this environment.</p>
      </StateNotice>
    );
  if (!backendConfigured)
    return (
      <StateNotice role="status" title="Library not connected">
        <p>Library connection is not configured for this environment.</p>
      </StateNotice>
    );
  return <SignedInGate>{children}</SignedInGate>;
}
