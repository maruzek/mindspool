import type { FunctionReturnType } from "convex/server";
import type { api } from "@mindspool/backend/api";

/** The bounded preview `items.list` returns; same type the web list uses. */
export type PreviewItem = FunctionReturnType<
  typeof api.items.list
>["page"][number];

export const PAGE_SIZE = 10;
