import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import { BoardEditor } from "./BoardEditor";
import { useBoardLayout } from "./useBoardLayout";
export function BoardView({
  labelId,
  name,
}: {
  labelId: Id<"labels">;
  name: string;
}) {
  const open = useMutation(api.boards.open);
  const [boardId, setBoardId] = useState<Id<"boards">>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setBoardId(undefined);
    void open({ labelId })
      .then((board) => {
        if (!cancelled) setBoardId(board._id);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [labelId, open, attempt]);
  if (failed)
    return (
      <div role="alert">
        Could not open board.{" "}
        <Button onClick={() => setAttempt((v) => v + 1)}>Retry</Button>
      </div>
    );
  if (!boardId) return <p role="status">Opening board…</p>;
  return <OpenedBoard key={boardId} boardId={boardId} name={name} />;
}
function OpenedBoard({
  boardId,
  name,
}: {
  boardId: Id<"boards">;
  name: string;
}) {
  const { board, layout, error, retry } = useBoardLayout(boardId);
  const navigate = useNavigate();
  const layouts = (
    <div className="flex gap-2">
      {(["list", "grid"] as const).map((layout) => (
        <Button
          key={layout}
          variant="outline"
          size="sm"
          onClick={() =>
            void navigate({ to: ".", search: (prev) => ({ ...prev, layout }) })
          }
        >
          {layout === "list" ? "List" : "Grid"}
        </Button>
      ))}
    </div>
  );
  return (
    <section className="relative flex h-svh flex-col bg-background">
      <header className="flex items-center gap-3 border-b-2 px-5 py-3.5">
        <h1 className="text-base">{name}</h1>
        <span className="flex-1" />
        {layouts}
      </header>
      <div className="p-6 md:hidden">
        <p>Board editing is available on desktop.</p>
        {layouts}
      </div>
      <div className="hidden min-h-0 flex-1 md:block">
        {error && (
          <p role="alert">
            Could not load board. <Button onClick={retry}>Retry</Button>
          </p>
        )}
        {!board || !layout ? (
          <p role="status">Loading complete layout…</p>
        ) : (
          <BoardEditor board={board} layout={layout} />
        )}
      </div>
    </section>
  );
}
