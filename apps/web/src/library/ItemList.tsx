import { useLinkProps, useSearch } from "@tanstack/react-router";
import { ItemRow } from "@mindspool/ui/components/mindspool/item-row";
import { ItemThumb } from "@mindspool/ui/components/mindspool/item-thumb";
import { LabelTag } from "@mindspool/ui/components/mindspool/label-tag";
import { ProcessingStatus } from "@mindspool/ui/components/mindspool/processing-status";
import { BrandIcon } from "./BrandIcon";
import { displayTitle, hostOfItem, kindOf, relativeDate } from "./itemDisplay";
import type { PreviewItem } from "./types";

export const SOURCES: Record<PreviewItem["captureSource"], string> = {
  web: "web",
  mobile: "mobile app",
  extension: "browser extension",
};

export function SourceLine({ item }: { item: PreviewItem }) {
  const host = hostOfItem(item);
  const kind = kindOf(item);
  return (
    <>
      <BrandIcon host={host} kind={kind} />
      <span className="truncate">
        {kind === "note" ? "note" : (host ?? "link")}
      </span>
      <span aria-hidden="true">·</span>
      <span className="truncate">via {SOURCES[item.captureSource]}</span>
    </>
  );
}

export function Tags({ item }: { item: PreviewItem }) {
  const extra = item.labelCount - item.labels.length;
  return (
    <>
      {item.labels.map((label) => (
        <LabelTag key={label._id}>{label.name}</LabelTag>
      ))}
      {extra > 0 && <LabelTag state="manual">+{extra}</LabelTag>}
    </>
  );
}

/**
 * Link to `?item=<id>` that keeps the other search params. The router's own
 * active state would mark every row `aria-current="page"`, so the selected
 * state is set here instead.
 */
export function ItemLink({
  itemId,
  selected,
  ...props
}: React.ComponentProps<"a"> & { itemId: string; selected: boolean }) {
  const link = useLinkProps({
    to: ".",
    search: (prev) => ({ ...prev, item: itemId }),
    resetScroll: false,
  });
  return (
    <a {...link} {...props} aria-current={selected ? "true" : undefined} />
  );
}

export function ItemList({
  items,
  highlightedId,
}: {
  items: PreviewItem[];
  highlightedId?: string | null;
}) {
  const { item: selectedId } = useSearch({ strict: false });
  return (
    <ul className="flex flex-col border-t-2 border-border">
      {items.map((item) => (
        <li key={item._id}>
          <ItemRow
            thumb={<ItemThumb kind={kindOf(item)} />}
            title={displayTitle(item)}
            source={<SourceLine item={item} />}
            status={<ProcessingStatus status={item.enrichmentStatus} />}
            labels={<Tags item={item} />}
            date={relativeDate(item._creationTime)}
            selected={item._id === selectedId}
            data-new={item._id === highlightedId || undefined}
            className={item._id === highlightedId ? "bg-accent" : undefined}
            render={
              <ItemLink itemId={item._id} selected={item._id === selectedId} />
            }
          />
        </li>
      ))}
    </ul>
  );
}
