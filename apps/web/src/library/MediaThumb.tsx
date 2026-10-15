import { useState } from "react";
import { ItemThumb } from "@mindspool/ui/components/mindspool/item-thumb";
import { hostOfItem, kindOf } from "@mindspool/schema";
import { cn } from "@mindspool/ui/lib/utils";
import { BrandIcon } from "./BrandIcon";
import type { PreviewItem } from "./types";

/**
 * The tile shown for an item: its first image, or the source's brand mark
 * (also when the image fails to load). The box is fixed-size so nothing shifts
 * as images arrive. Images are hotlinked and never sent a referrer.
 */
export function MediaThumb({
  item,
  className,
}: {
  item: PreviewItem;
  className?: string;
}) {
  return (
    <MediaThumbTile
      // A new URL gets a fresh error state.
      key={item.thumbnailUrl ?? ""}
      item={item}
      className={className}
    />
  );
}

function MediaThumbTile({
  item,
  className,
}: {
  item: PreviewItem;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const kind = kindOf(item);
  const showImage = item.thumbnailUrl && !failed;
  const extra = (item.imageCount ?? 1) - 1;
  return (
    <ItemThumb
      kind={kind}
      className={cn("relative overflow-hidden", className)}
    >
      {showImage ? (
        <>
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
          {extra > 0 && (
            <span className="absolute right-1 bottom-1 bg-background/85 px-1 text-[11px] leading-4 font-semibold text-foreground">
              +{extra}
            </span>
          )}
        </>
      ) : (
        <BrandIcon host={hostOfItem(item)} kind={kind} className="size-5" />
      )}
    </ItemThumb>
  );
}
