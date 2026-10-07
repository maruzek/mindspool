import { Link } from "@tanstack/react-router";
import { Button } from "@mindspool/ui/components/button";
import { Skeleton } from "@mindspool/ui/components/skeleton";
import { SOURCE_LABELS, hasFilters } from "../search/searchParams";
import type { LibrarySearch } from "../search/searchParams";

export type EmptyKind = "library" | "inbox" | "label";
type Clearable = "q" | "source" | "review";

export function ItemEmpty({
  kind,
  filters = {},
  onClear,
}: {
  kind: EmptyKind;
  filters?: LibrarySearch;
  onClear?: (which: Clearable) => void;
}) {
  const { q, source, review } = filters;
  return (
    <div
      data-slot="item-empty"
      className="flex flex-col gap-2 border-2 border-dashed border-border p-8"
    >
      {hasFilters(filters) ? (
        <>
          <h2 className="text-lg font-bold">
            {q ? `Nothing matches “${q}”.` : "No items match these filters."}
          </h2>
          {(source || review) && (
            <p className="text-muted-foreground">
              Filtered by{" "}
              {source && <b className="font-bold">{SOURCE_LABELS[source]}</b>}
              {source && review && ", "}
              {review && <b className="font-bold">Needs review</b>}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {q && (
              <Button variant="outline" onClick={() => onClear?.("q")}>
                Clear search
              </Button>
            )}
            {source && (
              <Button variant="outline" onClick={() => onClear?.("source")}>
                Clear source filter
              </Button>
            )}
            {review && (
              <Button variant="outline" onClick={() => onClear?.("review")}>
                Clear needs review
              </Button>
            )}
          </div>
        </>
      ) : kind === "library" ? (
        <>
          <h2 className="text-lg font-bold">Your library starts here.</h2>
          <p className="text-muted-foreground">
            Paste a link or write a note above to save your first item.
          </p>
        </>
      ) : kind === "inbox" ? (
        <>
          <h2 className="text-lg font-bold">
            Inbox zero. Everything is labeled.
          </h2>
          <p>
            <Link to="/library" className="underline underline-offset-4">
              Go to Library
            </Link>
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">No items in this label yet.</h2>
          <p className="text-muted-foreground">
            Items are added to a label from the item&rsquo;s labels.
          </p>
        </>
      )}
    </div>
  );
}

export function ItemSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading items"
      className="flex flex-col border-t-2 border-border"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b-2 border-border px-3 py-2.5"
        >
          <Skeleton className="h-14 w-[72px] shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
