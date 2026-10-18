import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { toast } from "@mindspool/ui/components/sonner";
import { errorMessage } from "../errors";
import type { PreviewItem } from "./types";

export type UnsureLabelPreview = PreviewItem["labels"][number];
export type Decision = "keep" | "remove";

export const unsureLabels = (item: PreviewItem) =>
  item.labels.filter((label) => label.unsure);

/**
 * Keep or remove model suggestions from the list. Every decision toasts with an
 * Undo that restores the suggestions as they were, attribution included.
 */
export function useUnsureActions() {
  const confirm = useMutation(api.itemLabels.confirm);
  const remove = useMutation(api.itemLabels.remove);
  const restore = useMutation(api.itemLabels.restoreSuggestion);

  return useCallback(
    async (
      decision: Decision,
      itemId: string,
      labels: UnsureLabelPreview[],
    ) => {
      const id = itemId as Id<"items">;
      const run = decision === "keep" ? confirm : remove;
      const results = await Promise.allSettled(
        labels.map((label) => run({ itemId: id, labelId: label._id })),
      );
      const done = labels.filter((_, i) => results[i]!.status === "fulfilled");
      const failed = results.find((r) => r.status === "rejected");
      if (failed)
        toast.error(
          errorMessage(
            failed.reason,
            decision === "keep"
              ? "Could not keep the label."
              : "Could not remove the label.",
          ),
        );
      if (done.length === 0) return;
      const verb = decision === "keep" ? "Kept" : "Removed";
      toast(
        done.length === 1
          ? `${verb} ${done[0]!.name}`
          : `${verb} ${done.length} labels`,
        {
          action: {
            label: "Undo",
            onClick: () =>
              void Promise.all(
                done.map((label) =>
                  restore({
                    itemId: id,
                    labelId: label._id,
                    // Unsure labels always carry their attribution.
                    confidence: label.confidence ?? 0,
                    provider: label.provider,
                    model: label.model,
                  }),
                ),
              ).catch((caught) =>
                toast.error(errorMessage(caught, "Could not undo.")),
              ),
          },
        },
      );
    },
    [confirm, remove, restore],
  );
}
