import { useEffect } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import type { LabelSearch } from "../search/searchParams";
import { LibraryTray } from "./LibraryTray";
import { useBoardTray } from "./useBoardTray";
import type { BoardPreview } from "./types";
export function BoardLibrary({
  boardId,
  filters,
  report,
  ...props
}: {
  boardId: Id<"boards">;
  filters: LabelSearch;
  report: (previews: BoardPreview[]) => void;
  onFilters: (patch: Partial<LabelSearch>) => void;
  placed: Set<string>;
  onAdd: (id: Id<"items">) => void;
  onLocate: (id: string) => void;
  disabled: boolean;
}) {
  const feed = useBoardTray(boardId, filters);
  const labels = usePaginatedQuery(
    api.labels.list,
    {},
    { initialNumItems: 20 },
  );
  useEffect(() => report(feed.results), [report, feed.results]);
  return (
    <>
      <LibraryTray
        {...props}
        boardKey={boardId}
        filters={filters}
        items={feed.results}
        status={feed.status}
        labels={labels.results}
        loadMore={() => feed.loadMore(20)}
      />
      {labels.status === "CanLoadMore" && filters.trayScope === "all" && (
        <button
          className="mx-5 mb-2 text-xs"
          onClick={() => labels.loadMore(20)}
        >
          Load more label filters
        </button>
      )}
    </>
  );
}
