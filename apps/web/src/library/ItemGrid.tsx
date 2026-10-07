import { useSearch } from "@tanstack/react-router";
import { ItemCard } from "@mindspool/ui/components/mindspool/item-card";
import { ItemThumb } from "@mindspool/ui/components/mindspool/item-thumb";
import { ProcessingStatus } from "@mindspool/ui/components/mindspool/processing-status";
import { ItemLink, SourceLine, Tags } from "./ItemList";
import { displayTitle, kindOf } from "./itemDisplay";
import type { PreviewItem } from "./types";

/** Three columns from 1280px, two from 768px, one below. */
export function ItemGrid({
  items,
  highlightedId,
}: {
  items: PreviewItem[];
  highlightedId?: string | null;
}) {
  const { item: selectedId } = useSearch({ strict: false });
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-4 @min-[560px]:grid-cols-2 @min-[960px]:grid-cols-3">
        {items.map((item) => (
          <li key={item._id} className="flex">
            <ItemCard
              thumb={<ItemThumb kind={kindOf(item)} className="h-32 w-full" />}
              title={displayTitle(item)}
              source={<SourceLine item={item} />}
              status={<ProcessingStatus status={item.enrichmentStatus} />}
              labels={
                item.labelCount > 0 || item.labeling ? (
                  <Tags item={item} />
                ) : undefined
              }
              selected={item._id === selectedId}
              data-new={item._id === highlightedId || undefined}
              className={
                item._id === highlightedId ? "w-full bg-accent" : "w-full"
              }
              render={
                <ItemLink
                  itemId={item._id}
                  selected={item._id === selectedId}
                />
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
