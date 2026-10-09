import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Columns3Icon, LayoutGridIcon, ListIcon, XIcon } from "lucide-react";
import { toast } from "@mindspool/ui/components/sonner";
import { Button } from "@mindspool/ui/components/button";
import { SegmentedControl } from "@mindspool/ui/components/mindspool/segmented-control";
import { ItemInspector } from "../inspector/ItemInspector";
import { CaptureBar } from "./CaptureBar";
import { ItemEmpty, ItemSkeleton } from "./ItemEmpty";
import type { EmptyKind } from "./ItemEmpty";
import { ItemGrid } from "./ItemGrid";
import { ItemList } from "./ItemList";
import { FilterBar } from "../search/FilterBar";
import { changeFilters, hasFilters } from "../search/searchParams";
import type { Layout, LibrarySearch } from "../search/searchParams";
import { useLabelingToasts } from "./useLabelingToasts";
import { PAGE_SIZE } from "./types";
import type { ItemFeed, PreviewItem } from "./types";

/** Heading, capture bar and a paginated item list; shared by both routes. */
export function LibraryView({
  heading,
  subheading,
  feed,
  scope = "library",
}: {
  /** The view's name: Library, Inbox, or the label. */
  heading: string;
  subheading?: ReactNode;
  feed: ItemFeed;
  scope?: EmptyKind;
}) {
  const { results, status, loadMore } = feed;
  const filters = useSearch({ strict: false }) as LibrarySearch;
  const { layout = "list", item: selectedId, q } = filters;
  const navigate = useNavigate();
  // A fresh save is highlighted, never opened: it does not touch `?item`.
  const [savedId, setSavedId] = useState<string | null>(null);
  const openItem = useCallback(
    (itemId: string) =>
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, item: itemId }),
        resetScroll: false,
      }),
    [navigate],
  );
  useLabelingToasts(results, openItem);
  const clear = useCallback(
    (which: "q" | "source" | "review") =>
      void navigate({
        to: ".",
        search: (prev) => changeFilters(prev, { [which]: undefined }),
        resetScroll: false,
      }),
    [navigate],
  );
  const searchAll = () =>
    void navigate({
      to: "/library",
      search: (prev) => changeFilters(prev, {}),
    });
  // Exact counts only describe the whole library: not a search, a filter, the inbox or a label.
  const wholeLibrary = scope === "library" && !hasFilters(filters);
  const stats = useQuery(api.items.stats, wholeLibrary ? {} : "skip");
  const more = status === "CanLoadMore" || status === "LoadingMore";
  return (
    <div className="flex min-h-full">
      <section className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <header className="flex items-baseline gap-3">
          <h1 className="text-2xl">{q ? `Results for “${q}”` : heading}</h1>
          {q && (
            <>
              <p className="text-sm text-muted-foreground">in {heading}</p>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear search"
                onClick={() => clear("q")}
              >
                <XIcon />
              </Button>
              {scope === "label" && (
                <Button variant="outline" size="sm" onClick={searchAll}>
                  Search all
                </Button>
              )}
            </>
          )}
          {stats && stats.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              {count(stats.total)}
              {stats.needsReview > 0 &&
                ` · ${stats.needsReview} awaiting review`}
            </p>
          ) : (
            results.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {count(results.length)}
                {more ? " loaded" : ""}
              </p>
            )
          )}
        </header>
        {q && (
          <p role="status" aria-label="Search status" className="sr-only">
            {status === "LoadingFirstPage"
              ? "Searching…"
              : results.length === 0
                ? "No results"
                : "Showing results"}
          </p>
        )}
        {subheading}
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <CaptureBar onSaved={setSavedId} />
          </div>
          <SegmentedControl
            aria-label="Layout"
            value={layout}
            onValueChange={(next) =>
              void navigate({
                to: ".",
                search: (prev) => ({
                  ...prev,
                  layout:
                    next === "board" && scope === "label"
                      ? "board"
                      : next === "grid"
                        ? "grid"
                        : "list",
                }),
              })
            }
            options={[
              { value: "list", label: "List", icon: <ListIcon /> },
              { value: "grid", label: "Grid", icon: <LayoutGridIcon /> },
              ...(scope === "label"
                ? [{ value: "board", label: "Board", icon: <Columns3Icon /> }]
                : []),
            ]}
          />
        </div>
        <FilterBar />
        {status === "LoadingFirstPage" ? (
          <ItemSkeleton />
        ) : results.length === 0 ? (
          <ItemEmpty kind={scope} filters={filters} onClear={clear} />
        ) : (
          <Items items={results} layout={layout} highlightedId={savedId} />
        )}
        {more && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(PAGE_SIZE)}
            >
              Load more
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {status === "LoadingMore" ? "Loading…" : ""}
            </p>
          </div>
        )}
      </section>
      <ItemInspector
        itemId={selectedId}
        onDeleted={() => toast("Item deleted")}
      />
    </div>
  );
}

function count(n: number) {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

function Items({
  items,
  layout,
  highlightedId,
}: {
  items: PreviewItem[];
  layout: Layout;
  highlightedId: string | null;
}) {
  return layout === "grid" ? (
    <ItemGrid items={items} highlightedId={highlightedId} />
  ) : (
    <ItemList items={items} highlightedId={highlightedId} />
  );
}
