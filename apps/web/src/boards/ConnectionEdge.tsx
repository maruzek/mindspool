import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import { ConnectionControls } from "./ConnectionControls";
import type { Connection } from "./types";
export const edgeColors = {
  ink: "var(--foreground)",
  accent: "var(--primary)",
  secondary: "var(--muted-foreground)",
};
export type BoardEdge = Edge<
  {
    connection: Connection;
    update: (
      patch: Partial<Pick<Connection, "arrows" | "color" | "label">>,
    ) => void;
    remove: () => void;
    disabled: boolean;
  },
  "connection"
>;
export const ConnectionEdge = memo(function ConnectionEdge(
  props: EdgeProps<BoardEdge>,
) {
  const [path, x, y] = getBezierPath(props);
  const data = props.data!;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        style={{
          stroke: edgeColors[data.connection.color],
          strokeWidth: props.selected ? 2.5 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute text-xs"
          style={{
            transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
          }}
        >
          {props.selected ? (
            <ConnectionControls {...data} />
          ) : (
            data.connection.label && (
              <span className="bg-background/90 px-2">
                {data.connection.label}
              </span>
            )
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
