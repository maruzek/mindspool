import { Component } from "react";
import type { ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { useCaptureDraft } from "./captureDraft";
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
          <p>
            Your library could not load. Your unsaved input is kept. Try
            reconnecting.
          </p>
          <button onClick={() => window.location.reload()}>Reconnect</button>
        </section>
      );
    return this.props.children;
  }
}

export function CaptureSession({ sessionKey }: { sessionKey: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { draft, setDraft, captured } = useCaptureDraft(sessionKey);
  if (isLoading) return <p role="status">Connecting to your library…</p>;
  if (!isAuthenticated)
    return (
      <section role="alert">
        <p>
          Your session could not connect to your library. Reconnect to try
          again; your unsaved input is kept.
        </p>
        {draft.originalInput && (
          <>
            <label htmlFor="retained-input">Unsaved input</label>
            <textarea
              id="retained-input"
              readOnly
              value={draft.originalInput}
              rows={4}
            />
          </>
        )}
        <button onClick={() => window.location.reload()}>Reconnect</button>
      </section>
    );
  // Data hooks mount only after Convex verifies the token.
  // https://docs.convex.dev/auth/clerk
  return (
    <LibraryBoundary>
      <Workspace draft={draft} onDraftChange={setDraft} onCaptured={captured} />
    </LibraryBoundary>
  );
}
