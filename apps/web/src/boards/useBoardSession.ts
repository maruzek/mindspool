import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutation } from "convex/react";
import { useBlocker } from "@tanstack/react-router";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { BoardSession } from "./boardSession";
import type { Layout } from "./types";
export function useBoardSession(
  boardId: Id<"boards">,
  layout: Layout,
  revision: number,
  additionalPending = false,
) {
  const apply = useMutation(api.boardOperations.apply);
  const [session] = useState(
    () =>
      new BoardSession(layout, revision, crypto.randomUUID(), (request) =>
        apply({ boardId, ...request }),
      ),
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(
    () => session.receive(layout, revision),
    [session, layout, revision],
  );
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      !(
        current.pathname === next.pathname &&
        "layout" in next.search &&
        next.search.layout === "board"
      ) &&
      (snapshot.pending || additionalPending) &&
      !window.confirm(
        "This board has unsaved changes. Leave and discard them?",
      ),
    enableBeforeUnload: snapshot.pending || additionalPending,
  });
  return { session, ...snapshot };
}
