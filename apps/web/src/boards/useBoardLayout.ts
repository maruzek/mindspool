import { useEffect, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Doc, Id } from "@mindspool/backend/data-model";
export interface BoardLayout {
  revision: number;
  elements: Doc<"boardElements">[];
  connections: Doc<"boardConnections">[];
}
/** Every page must share the subscribed revision; a torn read retries on the next revision. */
export function useBoardLayout(boardId: Id<"boards">) {
  const board = useQuery(api.boards.get, { boardId });
  const client = useConvex();
  const [layout, setLayout] = useState<BoardLayout>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!board) return;
    let cancelled = false;
    setError(false);
    async function load() {
      const elements: Doc<"boardElements">[] = [];
      const connections: Doc<"boardConnections">[] = [];
      for (const kind of ["elements", "connections"] as const) {
        let cursor: string | null = null;
        for (;;) {
          if (cancelled) return;
          const args: {
            boardId: Id<"boards">;
            paginationOpts: { numItems: number; cursor: string | null };
          } = { boardId, paginationOpts: { numItems: 50, cursor } };
          const page: {
            page: (Doc<"boardElements"> | Doc<"boardConnections">)[];
            revision: number;
            isDone: boolean;
            continueCursor: string;
          } =
            kind === "elements"
              ? await client.query(api.boards.elements, args)
              : await client.query(api.boards.connections, args);
          if (page.revision !== board!.revision)
            throw new Error("Layout changed while loading");
          if (kind === "elements")
            elements.push(...(page.page as Doc<"boardElements">[]));
          else connections.push(...(page.page as Doc<"boardConnections">[]));
          if (page.isDone) break;
          if (page.continueCursor === cursor)
            throw new Error("Layout cursor did not advance");
          cursor = page.continueCursor;
        }
      }
      if (!cancelled)
        setLayout({ revision: board!.revision, elements, connections });
    }
    void load().catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, board?.revision, client, attempt]);
  return { board, layout, error, retry: () => setAttempt((v) => v + 1) };
}
