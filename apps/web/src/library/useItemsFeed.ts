import { useSearch } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import type { LibrarySearch } from "../search/searchParams";
import { PAGE_SIZE } from "./types";
import type { ItemFeed } from "./types";

/**
 * The paginated feed for the current view: the library, the inbox, or one
 * label, listed or searched depending on `?q`, narrowed by `?source` and
 * `?review`. The three queries not in use are skipped, so only one subscribes.
 */
export function useItemsFeed(scope: {
  labelId?: Id<"labels">;
  inbox?: boolean;
}): ItemFeed {
  const { q, source, review } = useSearch({ strict: false }) as LibrarySearch;
  const { labelId, inbox } = scope;
  const filters = {
    ...(source && { source }),
    ...(review && { needsReview: true }),
  };
  const options = { initialNumItems: PAGE_SIZE };
  const list = usePaginatedQuery(
    api.items.list,
    !labelId && !q ? { ...filters, ...(inbox && { inbox }) } : "skip",
    options,
  );
  const search = usePaginatedQuery(
    api.items.search,
    !labelId && q ? { query: q, ...filters, ...(inbox && { inbox }) } : "skip",
    options,
  );
  const labelList = usePaginatedQuery(
    api.itemLabels.listItemsForLabel,
    labelId && !q ? { labelId, ...filters } : "skip",
    options,
  );
  const labelSearch = usePaginatedQuery(
    api.itemLabels.searchItemsForLabel,
    labelId && q ? { labelId, query: q, ...filters } : "skip",
    options,
  );
  if (labelId) return q ? labelSearch : labelList;
  return q ? search : list;
}
