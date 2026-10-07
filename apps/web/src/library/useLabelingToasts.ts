import { useEffect, useRef } from "react";
import { toast } from "@mindspool/ui/components/sonner";
import type { PreviewItem } from "./types";

/**
 * Toasts once when a visible item's labeling run finishes with unsure labels.
 * Only a pending-to-finished change counts, so old runs never toast on load.
 */
export function useLabelingToasts(
  items: PreviewItem[],
  open: (itemId: string) => void,
) {
  const labeling = useRef(new Map<string, boolean>());
  useEffect(() => {
    for (const item of items) {
      const now = item.labeling === true;
      const unsure = item.unsureCount ?? 0;
      if (labeling.current.get(item._id) === true && !now && unsure > 0)
        toast(
          unsure === 1
            ? "1 label needs a look"
            : `${unsure} labels need a look`,
          { action: { label: "Open", onClick: () => open(item._id) } },
        );
      labeling.current.set(item._id, now);
    }
  }, [items, open]);
}
