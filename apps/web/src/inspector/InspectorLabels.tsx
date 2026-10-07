import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { XIcon } from "lucide-react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import { LabelTag } from "@mindspool/ui/components/mindspool/label-tag";
import { AddLabelPopover } from "./AddLabelPopover";
import { errorMessage } from "../errors";
import { PAGE_SIZE } from "../library/types";

/** Confirmed labels of one item, ten per page, each removable. */
export function InspectorLabels({ itemId }: { itemId: Id<"items"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.itemLabels.listForItem,
    { itemId },
    { initialNumItems: PAGE_SIZE },
  );
  const remove = useMutation(api.itemLabels.remove);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRemove(labelId: Id<"labels">) {
    setPending(labelId);
    setError(null);
    try {
      await remove({ itemId, labelId });
    } catch (caught) {
      setError(errorMessage(caught, "Could not remove the label."));
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="inspector-labels" className="flex flex-col gap-2">
      <h3 id="inspector-labels" className="text-sm">
        Labels
      </h3>
      {status === "LoadingFirstPage" ? null : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {results.map((label) => (
            <li key={label._id}>
              <LabelTag className="gap-1 pr-1">
                {label.name}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 text-current"
                  aria-label={`Remove ${label.name}`}
                  disabled={pending === label._id}
                  onClick={() => void onRemove(label._id)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </LabelTag>
            </li>
          ))}
        </ul>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          Show more
        </Button>
      )}
      <AddLabelPopover itemId={itemId} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
