import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLinkProps, useSearch } from "@tanstack/react-router";
import { ItemRow } from "@mindspool/ui/components/mindspool/item-row";
import { LabelTag } from "@mindspool/ui/components/mindspool/label-tag";
import { ProcessingStatus } from "@mindspool/ui/components/mindspool/processing-status";
import { cn } from "@mindspool/ui/lib/utils";
import { BrandIcon } from "./BrandIcon";
import { UnsureLabel } from "./UnsureLabel";
import { unsureLabels, useUnsureActions } from "./useUnsureActions";
import { Button } from "@mindspool/ui/components/button";
import { MediaThumb } from "./MediaThumb";
import {
  displayTitle,
  hostOfItem,
  kindOf,
  relativeDate,
} from "@mindspool/schema";
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
  const decide = useUnsureActions();
  const unsure = unsureLabels(item);
  return (
    <>
      {item.labeling && (
        <LabelTag state="manual" className="gap-1">
          <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
          Labeling…
        </LabelTag>
      )}
      {item.labels.map((label) =>
        label.unsure ? (
          <UnsureLabel key={label._id} itemId={item._id} label={label} />
        ) : (
          <LabelTag key={label._id}>{label.name}</LabelTag>
        ),
      )}
      {unsure.length > 1 && (
        <Button
          variant="outline"
          size="xs"
          className="relative z-10"
          title="Keep all unsure labels (Y)"
          onClick={() => void decide("keep", item._id, unsure)}
        >
          <CheckIcon aria-hidden="true" />
          Keep all
        </Button>
      )}
      {extra > 0 && <LabelTag state="manual">+{extra}</LabelTag>}
    </>
  );
}

/**
 * Link to `?item=<id>` that keeps the other search params. Its `::after` covers
 * the whole row or card, so the label buttons can sit beside it without being
 * nested in the anchor. The router's own active state would mark every row
 * `aria-current="page"`, so the selected state is set here instead.
 */
export function ItemLink({
  itemId,
  selected,
  className,
  ...props
}: React.ComponentProps<"a"> & { itemId: string; selected: boolean }) {
  const link = useLinkProps({
    to: ".",
    search: (prev) => ({ ...prev, item: itemId }),
    resetScroll: false,
  });
  return (
    <a
      {...link}
      {...props}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
        className,
      )}
    />
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
  const decide = useUnsureActions();
  // The row the shortcuts act on: the one under the pointer, else the one J/K
  // moved to, else the open item. Only the keyboard's choice draws a ring.
  const [active, setActive] = useState<{
    id: string;
    by: "pointer" | "keyboard";
  } | null>(null);
  const activeId =
    items.find((item) => item._id === active?.id)?._id ?? selectedId ?? null;
  const keys = useRef({ items, activeId, decide });
  keys.current = { items, activeId, decide };

  // J/K move between rows; Y keeps and N removes the unsure labels of the
  // active row. Works without focus; ignored while typing, with modifiers held,
  // or while a dialog is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        target?.closest("input, textarea, select, [contenteditable]") ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return;
      const { items, activeId, decide } = keys.current;
      const key = event.key.toLowerCase();
      const index = items.findIndex((item) => item._id === activeId);
      if (key === "j" || key === "k") {
        const next =
          index < 0
            ? 0
            : Math.min(
                items.length - 1,
                Math.max(0, index + (key === "j" ? 1 : -1)),
              );
        const row = items[next];
        if (!row) return;
        event.preventDefault();
        setActive({ id: row._id, by: "keyboard" });
        document
          .querySelector(`[data-row-id="${row._id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else if (key === "y" || key === "n") {
        const item = items[index];
        const unsure = item ? unsureLabels(item) : [];
        if (!item || unsure.length === 0) return;
        event.preventDefault();
        void decide(key === "y" ? "keep" : "remove", item._id, unsure);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ul className="flex flex-col border-t-2 border-border">
      {items.map((item) => (
        <li
          key={item._id}
          data-row-id={item._id}
          onPointerMove={() =>
            active?.id === item._id && active.by === "pointer"
              ? undefined
              : setActive({ id: item._id, by: "pointer" })
          }
        >
          <ItemRow
            thumb={<MediaThumb item={item} />}
            title={
              <ItemLink itemId={item._id} selected={item._id === selectedId}>
                {displayTitle(item)}
              </ItemLink>
            }
            source={<SourceLine item={item} />}
            status={<ProcessingStatus status={item.enrichmentStatus} />}
            labels={<Tags item={item} />}
            date={relativeDate(item._creationTime)}
            selected={item._id === selectedId}
            data-new={item._id === highlightedId || undefined}
            className={cn(
              item._id === highlightedId && "bg-accent",
              active?.by === "keyboard" &&
                active.id === item._id &&
                "bg-foreground/5 ring-2 ring-ring ring-inset",
            )}
          />
        </li>
      ))}
    </ul>
  );
}
