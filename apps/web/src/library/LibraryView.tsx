import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { toast } from "@mindspool/ui/components/sonner";
import { Button } from "@mindspool/ui/components/button";
import { SegmentedControl } from "@mindspool/ui/components/mindspool/segmented-control";
import { ItemInspector } from "../inspector/ItemInspector";
import { CaptureBar } from "./CaptureBar";
import { ItemEmpty, ItemSkeleton } from "./ItemEmpty";
import type { EmptyKind } from "./ItemEmpty";
import { ItemGrid } from "./ItemGrid";
import { ItemList } from "./ItemList";
import type { Layout } from "./search";
import { PAGE_SIZE } from "./types";
import type { ItemFeed, PreviewItem } from "./types";

/** Heading, capture bar and a paginated item list; shared by both routes. */
export function LibraryView({
  heading,
  feed,
  empty = "library",
}: {
  heading: string;
  feed: ItemFeed;
  empty?: EmptyKind;
}) {
  const { results, status, loadMore } = feed;
  const { layout = "list", item: selectedId } = useSearch({ strict: false });
  const navigate = useNavigate();
  // A fresh save is highlighted, never opened: it does not touch `?item`.
  const [savedId, setSavedId] = useState<string | null>(null);
  const more = status === "CanLoadMore" || status === "LoadingMore";
  return (
    <div className="flex min-h-full">
      <section className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <header className="flex items-baseline gap-3">
          <h1 className="text-2xl">{heading}</h1>
          {results.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "item" : "items"}
              {more ? " loaded" : ""}
            </p>
          )}
        </header>
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
                  layout: next === "grid" ? "grid" : "list",
                }),
              })
            }
            options={[
              { value: "list", label: "List", icon: <ListIcon /> },
              { value: "grid", label: "Grid", icon: <LayoutGridIcon /> },
            ]}
          />
        </div>
        {status === "LoadingFirstPage" ? (
          <ItemSkeleton />
        ) : results.length === 0 ? (
          <ItemEmpty kind={empty} />
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
