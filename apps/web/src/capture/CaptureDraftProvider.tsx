import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useCaptureDraft } from "./captureDraft";

type CaptureDraftState = ReturnType<typeof useCaptureDraft>;
const CaptureDraftContext = createContext<CaptureDraftState | null>(null);

/**
 * Holds the unsaved capture draft for one Clerk session. It sits above the
 * Convex auth gate so a token refresh never discards what the user typed.
 */
export function CaptureDraftProvider({
  sessionKey,
  children,
}: {
  sessionKey: string;
  children: ReactNode;
}) {
  return (
    <CaptureDraftContext value={useCaptureDraft(sessionKey)}>
      {children}
    </CaptureDraftContext>
  );
}

export function useCaptureDraftContext(): CaptureDraftState {
  const value = useContext(CaptureDraftContext);
  if (!value)
    throw new Error("useCaptureDraftContext needs a CaptureDraftProvider");
  return value;
}
