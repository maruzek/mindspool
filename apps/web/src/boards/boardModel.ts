import type { BoardLayout } from "./useBoardLayout";
import type { Layout } from "./types";
export function layoutFromDocuments(layout: BoardLayout): Layout {
  return {
    elements: layout.elements.map(({ key, data }) => ({ key, data })),
    connections: layout.connections.map(
      ({ key, source, target, arrows, label, color }) => ({
        key,
        source,
        target,
        arrows,
        label,
        color,
      }),
    ),
  };
}
