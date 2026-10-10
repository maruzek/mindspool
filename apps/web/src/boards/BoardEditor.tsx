import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "@mindspool/backend/api";
import type { Doc, Id } from "@mindspool/backend/data-model";
import type { Viewport } from "@xyflow/react";
import { ItemInspector } from "../inspector/ItemInspector";
import { BoardReadBoundary } from "./BoardReadBoundary";
import { changeBoardFilters } from "../search/searchParams";
import type { LabelSearch } from "../search/searchParams";
import { layoutFromDocuments } from "./boardModel";
import { BoardCanvas } from "./BoardCanvas";
import type { CanvasApi } from "./BoardCanvas";
import { columnAt, reorderForInsertion } from "./canvasModel";
import { NewNoteDialog } from "./NewNoteDialog";
import { OrganizationDialog } from "./OrganizationDialog";
import { BoardLibrary } from "./BoardLibrary";
import { useBoardSession } from "./useBoardSession";
import type { BoardLayout } from "./useBoardLayout";
import type { BoardPreview, Layout } from "./types";
function PreviewBatch({
  boardId,
  keys,
  report,
}: {
  boardId: Id<"boards">;
  keys: string[];
  report: (key: string, previews: BoardPreview[]) => void;
}) {
  const result = useQuery(api.boardPreviews.placed, { boardId, keys });
  const batchKey = keys.join("|");
  useEffect(() => {
    if (result) report(batchKey, result);
  }, [result, batchKey, report]);
  return null;
}
export function BoardEditor({
  board,
  layout,
}: {
  board: Doc<"boards">;
  layout: BoardLayout;
}) {
  const [viewportDraft, setViewportDraft] = useState<Viewport>();
  const [viewportStatus, setViewportStatus] = useState("saved");
  const latest = useMemo<Layout>(() => layoutFromDocuments(layout), [layout]);
  const {
    session,
    layout: draft,
    status,
    pending,
    message,
  } = useBoardSession(
    board._id,
    latest,
    layout.revision,
    viewportStatus !== "saved",
  );
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as LabelSearch;
  const [trayPreviews, setTrayPreviews] = useState<BoardPreview[]>([]);
  const reportTray = useCallback(
    (results: BoardPreview[]) => {
      // Filtering the tray must not discard a placed card's preview while its
      // save or authoritative board preview subscription is still pending.
      const placed = new Set(
        draft.elements.flatMap((element) =>
          element.data.type === "item" ? [element.data.itemId] : [],
        ),
      );
      setTrayPreviews((previous) => {
        const retained = new Map(
          previous
            .filter((preview) => placed.has(preview.itemId))
            .map((preview) => [preview.itemId, preview]),
        );
        for (const preview of results) retained.set(preview.itemId, preview);
        return [...retained.values()];
      });
    },
    [draft.elements],
  );
  const [batches, setBatches] = useState<Record<string, BoardPreview[]>>({});
  const keys = useMemo(
    () =>
      latest.elements.filter((e) => e.data.type === "item").map((e) => e.key),
    [latest],
  );
  const chunks = useMemo(
    () =>
      Array.from({ length: Math.ceil(keys.length / 20) }, (_, i) =>
        keys.slice(i * 20, i * 20 + 20),
      ),
    [keys],
  );
  const report = useCallback(
    (key: string, previews: BoardPreview[]) =>
      setBatches((prev) => ({ ...prev, [key]: previews })),
    [],
  );
  const previewMap = useMemo(() => {
    const map = new Map<string, BoardPreview>();
    for (const chunk of chunks)
      for (const preview of batches[chunk.join("|")] ?? [])
        map.set(preview.itemId, preview);
    for (const preview of trayPreviews)
      if (!map.has(preview.itemId)) map.set(preview.itemId, preview);
    return map;
  }, [chunks, batches, trayPreviews]);
  const previews = useMemo(() => [...previewMap.values()], [previewMap]);
  // A completed reactive batch omits invalid references even before cleanup changes the layout.
  const invalidKeys = useMemo(
    () =>
      new Set(
        chunks.flatMap((chunk) => {
          const result = batches[chunk.join("|")];
          if (!result) return [];
          const found = new Set(result.map((p) => p.itemId));
          return latest.elements
            .filter(
              (e) =>
                chunk.includes(e.key) &&
                e.data.type === "item" &&
                !found.has(e.data.itemId),
            )
            .map((e) => e.key);
        }),
      ),
    [chunks, batches, latest],
  );
  const visible = useMemo(
    () => ({
      elements: draft.elements.filter((e) => !invalidKeys.has(e.key)),
      connections: draft.connections.filter(
        (e) => !invalidKeys.has(e.source) && !invalidKeys.has(e.target),
      ),
    }),
    [draft, invalidKeys],
  );
  const canvas = useRef<CanvasApi>(null);
  const [creation, setCreation] = useState<{
    type: "note" | "heading" | "column";
    point: { x: number; y: number };
    columnKey?: string;
    key?: string;
  }>();
  useEffect(() => {
    if (
      creation?.key &&
      status === "saved" &&
      draft.elements.some((e) => e.key === creation.key)
    )
      setCreation(undefined);
  }, [creation, status, draft]);
  const setViewport = useMutation(api.boards.setViewport);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const viewportRef = useRef<Viewport | undefined>(undefined);
  const saveViewport = useCallback(() => {
    if (!viewportRef.current) return;
    const value = viewportRef.current;
    setViewportStatus("saving");
    void setViewport({ boardId: board._id, viewport: value })
      .then(() => {
        if (viewportRef.current === value) {
          viewportRef.current = undefined;
          setViewportStatus("saved");
        }
      })
      .catch(() => setViewportStatus("error"));
  }, [setViewport, board._id]);
  useEffect(
    () => () => {
      clearTimeout(viewportTimer.current);
    },
    [],
  );
  const onViewport = useCallback(
    (value: Viewport) => {
      setViewportDraft(value);
      viewportRef.current = value;
      setViewportStatus("saving");
      clearTimeout(viewportTimer.current);
      viewportTimer.current = setTimeout(saveViewport, 500);
    },
    [saveViewport],
  );
  useEffect(() => {
    if (viewportStatus === "saved") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [viewportStatus]);
  const disabled =
    status === "error" || status === "conflict" || viewportStatus === "error";
  const place = useCallback(
    (itemId: Id<"items">, point: { x: number; y: number }) => {
      const existing = draft.elements.find(
        (e) => e.data.type === "item" && e.data.itemId === itemId,
      );
      if (existing) {
        canvas.current?.locate(existing.key);
        return;
      }
      const target = columnAt(draft, point, previews);
      session.submit([
        ...(target
          ? reorderForInsertion(draft, target.column.key, target.order)
          : []),
        {
          type: "place",
          key: crypto.randomUUID(),
          itemId,
          ...point,
          ...(target
            ? { columnKey: target.column.key, order: target.order }
            : {}),
        },
      ]);
    },
    [draft, session, previews],
  );
  const open = useCallback(
    (itemId: string) =>
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, item: itemId }),
        resetScroll: false,
      }),
    [navigate],
  );
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {chunks.map((chunk) => (
        <BoardReadBoundary key={chunk.join("|")}>
          <PreviewBatch boardId={board._id} keys={chunk} report={report} />
        </BoardReadBoundary>
      ))}
      <div className="relative min-h-0 flex-1">
        <BoardCanvas
          ref={canvas}
          layout={visible}
          previews={previews}
          viewport={viewportDraft ?? board.viewport}
          disabled={disabled}
          submit={(ops) => session.submit(ops)}
          place={place}
          open={open}
          onViewport={onViewport}
          status={status === "saved" ? viewportStatus : status}
          message={message}
          retry={() => {
            session.retry();
            if (viewportStatus === "error") saveViewport();
          }}
          reload={() => {
            session.reload(latest, layout.revision);
            if (creation?.key) setCreation({ ...creation, key: undefined });
          }}
          undo={() => session.undo()}
          redo={() => session.redo()}
          canUndo={session.history.canUndo && !pending}
          canRedo={session.history.canRedo && !pending}
          create={(type, point, columnKey) =>
            setCreation({ type, point, columnKey })
          }
        />
        {!draft.elements.length && !pending && (
          <p className="pointer-events-none absolute top-1/3 left-1/2 max-w-sm -translate-x-1/2 text-center text-sm text-muted-foreground">
            Drag items from the library below onto this board.
          </p>
        )}
      </div>
      <BoardReadBoundary>
        <BoardLibrary
          boardId={board._id}
          report={reportTray}
          filters={filters}
          onFilters={(patch) =>
            void navigate({
              to: ".",
              search: (prev) => changeBoardFilters(prev, patch),
              resetScroll: false,
            })
          }
          placed={
            new Set(
              visible.elements.flatMap((e) =>
                e.data.type === "item" ? [e.data.itemId] : [],
              ),
            )
          }
          onAdd={(id) => place(id, canvas.current?.center() ?? { x: 0, y: 0 })}
          onLocate={(id) => {
            const element = draft.elements.find(
              (e) => e.data.type === "item" && e.data.itemId === id,
            );
            if (element) canvas.current?.locate(element.key);
          }}
          disabled={disabled}
        />
      </BoardReadBoundary>
      {creation?.type === "note" && (
        <NewNoteDialog
          status={status}
          onRetry={() => session.retry()}
          onReload={() => {
            session.reload(latest, layout.revision);
            setCreation({ ...creation, key: undefined });
          }}
          onClose={() => setCreation(undefined)}
          onCreate={(originalInput) => {
            const key = crypto.randomUUID();
            const column = draft.elements.find(
              (e) => e.key === creation.columnKey,
            );
            const order = column
              ? draft.elements.filter(
                  (e) =>
                    e.data.type === "item" && e.data.columnKey === column.key,
                ).length
              : undefined;
            setCreation({ ...creation, key });
            session.submit([
              {
                type: "note",
                key,
                originalInput,
                ...creation.point,
                ...(column ? { columnKey: column.key, order } : {}),
              },
            ]);
          }}
        />
      )}
      {creation && creation.type !== "note" && (
        <OrganizationDialog
          type={creation.type}
          close={() => setCreation(undefined)}
          create={(text) => {
            const key = crypto.randomUUID();
            session.submit([
              {
                type: "set",
                key,
                data:
                  creation.type === "column"
                    ? {
                        type: "column",
                        title: text,
                        ...creation.point,
                        width: 400,
                      }
                    : { type: "heading", text, ...creation.point, width: 480 },
              },
            ]);
            setCreation(undefined);
          }}
        />
      )}
      <div className="absolute inset-y-0 right-0 z-20">
        <ItemInspector itemId={filters.item} />
      </div>
    </div>
  );
}
