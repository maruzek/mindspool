import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Ref } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from "@xyflow/react";
import type { Node, Edge, Viewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BoardPreview, Layout, Operation } from "./types";
import { ITEM_DRAG } from "./LibraryTray";
import { ItemCardNode } from "./ItemCardNode";
import { ColumnNode } from "./ColumnNode";
import { HeadingNode } from "./HeadingNode";
import { ConnectionEdge, edgeColors } from "./ConnectionEdge";
import { columnAt, moveCard } from "./canvasModel";
import { groupMove, groupRemove } from "./boardSelection";
import { effectiveCard } from "./cardContent";
import { cardHeight } from "./cardGeometry";
import { BoardControls } from "./BoardControls";
import type { Tool } from "./BoardControls";
export function dropPosition(
  screen: { x: number; y: number },
  bounds: { left: number; top: number },
  viewport: Viewport,
) {
  return {
    x: (screen.x - bounds.left - viewport.x) / viewport.zoom,
    y: (screen.y - bounds.top - viewport.y) / viewport.zoom,
  };
}
export interface CanvasApi {
  center: () => { x: number; y: number };
  locate: (key: string) => void;
}
export interface CanvasProps {
  layout: Layout;
  previews: BoardPreview[];
  viewport: Viewport;
  disabled: boolean;
  submit: (ops: Operation[]) => void;
  place: (
    itemId: BoardPreview["itemId"],
    point: { x: number; y: number },
  ) => void;
  open: (itemId: string) => void;
  onViewport: (viewport: Viewport) => void;
  status: string;
  message?: string;
  retry: () => void;
  reload: () => void;
  ref?: Ref<CanvasApi>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  create: (
    type: "note" | "heading" | "column",
    point: { x: number; y: number },
    columnKey?: string,
  ) => void;
}
const nodeTypes = {
  item: ItemCardNode,
  column: ColumnNode,
  heading: HeadingNode,
};
const edgeTypes = { connection: ConnectionEdge };
export function BoardCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
function Canvas({
  layout,
  previews,
  viewport,
  disabled,
  submit,
  place,
  open,
  onViewport,
  status,
  message,
  retry,
  reload,
  undo,
  redo,
  canUndo,
  canRedo,
  create,
  ref,
}: CanvasProps) {
  const flow = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [space, setSpace] = useState(false);
  const [zoom, setZoom] = useState(viewport.zoom);
  const selected = useRef(new Set<string>());
  const selectedEdges = useRef(new Set<string>());
  const [dropColumn, setDropColumn] = useState<string>();
  const mapped = useMemo<Node[]>(
    () =>
      layout.elements.map((element) => {
        const { data, key } = element;
        const preview =
          data.type === "item"
            ? previews.find((p) => p.itemId === data.itemId)
            : undefined;
        return {
          id: key,
          type: data.type,
          position: { x: data.x, y: data.y },
          selected: selected.current.has(key),
          data:
            data.type === "item"
              ? {
                  card: data,
                  preview,
                  open: () => open(data.itemId),
                  remove: () => submit([{ type: "remove", key }]),
                  update: (value: typeof data) =>
                    submit([{ type: "set", key, data: value }]),
                  connecting: tool === "connect",
                  disabled,
                }
              : data.type === "column"
                ? {
                    title: data.title,
                    width: data.width,
                    update: (patch: { title?: string; width?: number }) =>
                      submit([
                        { type: "set", key, data: { ...data, ...patch } },
                      ]),
                    remove: () => submit([{ type: "remove", key }]),
                    note: () =>
                      create("note", { x: data.x + 16, y: data.y + 48 }, key),
                    disabled,
                    drop: dropColumn === key,
                  }
                : {
                    text: data.text,
                    update: (text: string) =>
                      submit([{ type: "set", key, data: { ...data, text } }]),
                    remove: () => submit([{ type: "remove", key }]),
                    disabled,
                  },
          zIndex: data.type === "column" ? 0 : 1,
          style: {
            width: data.width,
            ...(data.type === "column"
              ? {
                  height:
                    80 +
                    layout.elements.reduce(
                      (height, e) =>
                        height +
                        (e.data.type === "item" && e.data.columnKey === key
                          ? cardHeight(
                              effectiveCard(
                                e.data,
                                previews.find(
                                  (p) =>
                                    p.itemId ===
                                    (e.data.type === "item"
                                      ? e.data.itemId
                                      : undefined),
                                ),
                              ),
                              Boolean(
                                previews.find(
                                  (p) =>
                                    p.itemId ===
                                    (e.data.type === "item"
                                      ? e.data.itemId
                                      : undefined),
                                )?.imageUrl,
                              ),
                            ) + 16
                          : 0),
                      0,
                    ),
                }
              : {}),
            ...(data.type === "item"
              ? {
                  height: cardHeight(
                    effectiveCard(data, preview),
                    Boolean(preview?.imageUrl),
                  ),
                }
              : {}),
          },
        };
      }),
    [layout, previews, open, submit, tool, disabled, create, dropColumn],
  );
  const mappedEdges = useMemo<Edge[]>(
    () =>
      layout.connections.map((connection) => ({
        id: connection.key,
        type: "connection",
        source: connection.source,
        target: connection.target,
        selected: selectedEdges.current.has(connection.key),
        markerEnd:
          connection.arrows !== "none"
            ? {
                type: MarkerType.ArrowClosed,
                color: edgeColors[connection.color],
              }
            : undefined,
        markerStart:
          connection.arrows === "both"
            ? {
                type: MarkerType.ArrowClosed,
                color: edgeColors[connection.color],
              }
            : undefined,
        data: {
          connection,
          update: (patch: object) => {
            const { key, ...data } = connection;
            submit([{ type: "edge", key, data: { ...data, ...patch } }]);
          },
          remove: () => submit([{ type: "removeEdge", key: connection.key }]),
          disabled,
        },
      })),
    [layout.connections, submit, disabled],
  );
  const [edges, setEdges] = useState(mappedEdges);
  useEffect(() => setEdges(mappedEdges), [mappedEdges]);
  const [nodes, setNodes] = useState(mapped);
  useEffect(() => setNodes(mapped), [mapped]);
  useImperativeHandle(
    ref,
    () => ({
      center: () => {
        const bounds = container.current!.getBoundingClientRect();
        return flow.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        });
      },
      locate: (key) => {
        const node = flow.getNode(key);
        if (node) {
          selected.current = new Set([key]);
          setNodes((prev) =>
            prev.map((n) => ({ ...n, selected: n.id === key })),
          );
          void flow.setCenter(
            node.position.x + (node.width ?? 300) / 2,
            node.position.y + (node.height ?? 120) / 2,
            { zoom: flow.getZoom(), duration: 200 },
          );
        }
      },
    }),
    [flow],
  );
  const drop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDropColumn(undefined);
      const id = event.dataTransfer.getData(ITEM_DRAG);
      if (id && !disabled)
        place(
          id as BoardPreview["itemId"],
          flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
    },
    [disabled, flow, place],
  );
  return (
    <div
      ref={container}
      className="h-full outline-none"
      tabIndex={0}
      aria-label="Board canvas"
      onDrop={drop}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ITEM_DRAG)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropColumn(
            columnAt(
              layout,
              flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              previews,
            )?.column.key,
          );
        }
      }}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,select,[contenteditable=true]",
          )
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          selected.current = new Set(nodes.map((n) => n.id));
          selectedEdges.current = new Set(edges.map((e) => e.id));
          setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
          setEdges((prev) => prev.map((edge) => ({ ...edge, selected: true })));
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        if (e.ctrlKey && e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
        if ((e.key === "Delete" || e.key === "Backspace") && !disabled) {
          e.preventDefault();
          submit(groupRemove(layout, selected.current, selectedEdges.current));
        }
        if (e.code === "Space") {
          e.preventDefault();
          setSpace(true);
        }
        if (e.key === "Escape") {
          selected.current.clear();
          selectedEdges.current.clear();
          setEdges((prev) =>
            prev.map((edge) => ({ ...edge, selected: false })),
          );
          setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
          setTool("select");
        }
      }}
      onKeyUp={(e) => {
        if (e.code === "Space") setSpace(false);
      }}
      onBlur={() => setSpace(false)}
    >
      <ReactFlow
        onlyRenderVisibleElements
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onEdgesChange={(changes) =>
          setEdges((prev) => applyEdgeChanges(changes, prev))
        }
        onConnect={(connection) => {
          if (connection.source && connection.target && !disabled)
            submit([
              {
                type: "edge",
                key: crypto.randomUUID(),
                data: {
                  source: connection.source,
                  target: connection.target,
                  arrows: "none",
                  label: "",
                  color: "ink",
                },
              },
            ]);
        }}
        defaultViewport={viewport}
        minZoom={0.25}
        maxZoom={2}
        nodesDraggable={!disabled && tool === "select" && !space}
        nodesConnectable={tool === "connect" && !disabled}
        onNodesChange={(changes) =>
          setNodes((prev) => applyNodeChanges(changes, prev))
        }
        onSelectionChange={({ nodes, edges }) => {
          selected.current = new Set(nodes.map((n) => n.id));
          selectedEdges.current = new Set(edges.map((e) => e.id));
        }}
        onNodeDragStop={(_, node) => {
          if (disabled) return;
          const element = layout.elements.find((e) => e.key === node.id);
          if (!element) return;
          if (element.data.type === "item" && selected.current.size <= 1)
            submit(moveCard(layout, element, node.position, previews));
          else
            submit(
              groupMove(
                layout,
                selected.current.size ? selected.current : new Set([node.id]),
                {
                  x: node.position.x - element.data.x,
                  y: node.position.y - element.data.y,
                },
              ),
            );
        }}
        onNodeDoubleClick={(_, node) => {
          const e = layout.elements.find((e) => e.key === node.id);
          if (e?.data.type === "item") open(e.data.itemId);
        }}
        onMove={(_, value) => setZoom(value.zoom)}
        onMoveEnd={(_, value) => onViewport(value)}
        panOnScroll
        zoomOnScroll={false}
        selectionOnDrag={tool === "select" && !space}
        panOnDrag={tool === "pan" || space ? true : [1, 2]}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={24}
          color="color-mix(in srgb, var(--primary) 11%, transparent)"
        />
      </ReactFlow>
      <BoardControls
        tool={tool}
        setTool={setTool}
        status={status}
        message={message}
        retry={retry}
        reload={reload}
        zoom={zoom}
        onZoom={(value) => void flow.zoomTo(value)}
        fit={() =>
          void flow.fitView({ padding: 0.2, minZoom: 0.25, maxZoom: 2 })
        }
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        disabled={disabled}
        create={(type) => {
          const bounds = container.current!.getBoundingClientRect();
          create(
            type,
            flow.screenToFlowPosition({
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            }),
          );
        }}
      />
    </div>
  );
}
