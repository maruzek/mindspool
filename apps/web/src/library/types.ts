import type { FunctionReturnType } from "convex/server";
import type { api } from "@mindspool/backend/api";

/** The bounded preview both list queries return. */
export type PreviewItem = FunctionReturnType<
  typeof api.items.list
>["page"][number];

export type PaginationStatus =
  "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

export interface ItemFeed {
  results: PreviewItem[];
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
}

export const PAGE_SIZE = 10;
