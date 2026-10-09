import type { FunctionReturnType, FunctionArgs } from "convex/server";
import type { api } from "@mindspool/backend/api";
import type { Doc } from "@mindspool/backend/data-model";
export type BoardPreview = FunctionReturnType<
  typeof api.boardPreviews.placed
>[number];
export type Operation = FunctionArgs<
  typeof api.boardOperations.apply
>["operations"][number];
export type Element = { key: string; data: Doc<"boardElements">["data"] };
export type Connection = Pick<
  Doc<"boardConnections">,
  "key" | "source" | "target" | "arrows" | "label" | "color"
>;
export interface Layout {
  elements: Element[];
  connections: Connection[];
}
