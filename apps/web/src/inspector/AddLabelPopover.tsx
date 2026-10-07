import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { PlusIcon } from "lucide-react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import { Checkbox } from "@mindspool/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@mindspool/ui/components/popover";
import { errorMessage } from "../errors";
import { PAGE_SIZE } from "../library/types";

/** "Add label" popover; it subscribes to the owner's labels only while open. */
export function AddLabelPopover({ itemId }: { itemId: Id<"items"> }) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="self-start" />}
      >
        <PlusIcon aria-hidden="true" />
        Add label
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Add label">
        <Choices itemId={itemId} />
      </PopoverContent>
    </Popover>
  );
}

function Choices({ itemId }: { itemId: Id<"items"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.itemLabels.availableLabels,
    { itemId },
    { initialNumItems: PAGE_SIZE },
  );
  const attach = useMutation(api.itemLabels.attach);
  const remove = useMutation(api.itemLabels.remove);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(labelId: Id<"labels">, assigned: boolean) {
    setPending(labelId);
    setError(null);
    try {
      await (assigned ? remove : attach)({ itemId, labelId });
    } catch (caught) {
      setError(errorMessage(caught, "Could not update the label."));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {status === "LoadingFirstPage" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no labels yet. Create one from the sidebar.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {results.map((label) => (
            <li key={label._id}>
              <label className="flex items-center gap-2 py-1 text-sm">
                <Checkbox
                  checked={label.isAssigned}
                  disabled={pending === label._id}
                  onCheckedChange={() =>
                    void toggle(label._id, label.isAssigned)
                  }
                />
                {label.name}
              </label>
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
