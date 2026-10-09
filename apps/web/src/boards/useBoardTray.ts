import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import type { LabelSearch } from "../search/searchParams";
export function trayArgs(boardId: Id<"boards">, filters: LabelSearch) {
  return {
    boardId,
    scope: filters.trayScope ?? "label",
    sort: filters.traySort ?? "newest",
    ...(filters.trayScope === "all" && filters.trayLabel
      ? { labelId: filters.trayLabel as Id<"labels"> }
      : {}),
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.review ? { needsReview: true } : {}),
  };
}
export function useBoardTray(boardId: Id<"boards">, filters: LabelSearch) {
  return usePaginatedQuery(api.boardTray.browse, trayArgs(boardId, filters), {
    initialNumItems: 20,
  });
}
