import { Skeleton } from "@mindspool/ui/components/skeleton";

export type EmptyKind = "library" | "label";

export function ItemEmpty({ kind }: { kind: EmptyKind }) {
  return (
    <div
      data-slot="item-empty"
      className="flex flex-col gap-1 border-2 border-dashed border-border p-8"
    >
      {kind === "library" ? (
        <>
          <h2 className="text-lg font-bold">Your library starts here.</h2>
          <p className="text-muted-foreground">
            Paste a link or write a note above to save your first item.
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
