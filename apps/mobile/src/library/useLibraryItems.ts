import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { PAGE_SIZE } from "./types";
import type { PreviewItem } from "./types";

export type LibraryFeed = {
  results: PreviewItem[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: () => void;
};

/** Newest first, live: labels appear as soon as Clef finishes. */
export function useLibraryItems(): LibraryFeed {
  // Queries wait for a confirmed session: asking while the token is being
  // refreshed makes the server answer UNAUTHENTICATED.
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.items.list,
    isAuthenticated ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  return { results, status, loadMore: () => loadMore(PAGE_SIZE) };
}
