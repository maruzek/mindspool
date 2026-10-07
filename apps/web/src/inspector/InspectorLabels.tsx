import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { SparklesIcon, XIcon } from "lucide-react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { UNSURE_THRESHOLD } from "@mindspool/schema";
import { Button } from "@mindspool/ui/components/button";
import { LabelTag } from "@mindspool/ui/components/mindspool/label-tag";
import { AddLabelPopover } from "./AddLabelPopover";
import { errorMessage } from "../errors";
import { PAGE_SIZE } from "../library/types";
import type { ItemLabel } from "./types";

const PROVIDER = { clef: "Clef", "clef-flash": "Clef-flash" } as const;

function attribution(label: ItemLabel) {
  const who = label.provider
    ? PROVIDER[label.provider as keyof typeof PROVIDER]
    : undefined;
  const percent =
    label.confidence === undefined
      ? ""
      : ` · ${Math.round(label.confidence * 100)}%`;
  return `Added by ${who ?? label.model ?? "a model"}${percent}`;
}
const isUnsure = (label: ItemLabel) =>
  label.origin === "model" &&
  label.confirmedAt === undefined &&
  label.confidence !== undefined &&
  label.confidence < UNSURE_THRESHOLD;

/** Confirmed labels of one item, ten per page, each removable. */
export function InspectorLabels({ itemId }: { itemId: Id<"items"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.itemLabels.listForItem,
    { itemId },
    { initialNumItems: PAGE_SIZE },
  );
  const remove = useMutation(api.itemLabels.remove);
  const confirm = useMutation(api.itemLabels.confirm);
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
  async function onKeep(labelId: Id<"labels">) {
    setPending(labelId);
    setError(null);
    try {
      await confirm({ itemId, labelId });
    } catch (caught) {
      setError(errorMessage(caught, "Could not keep the label."));
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
          {results.map((label) => {
            const unsure = isUnsure(label);
            return (
              <li key={label._id}>
                <LabelTag
                  state={unsure ? "suggested" : "confirmed"}
                  className="gap-1 pr-1"
                >
                  {label.name}
                  {label.origin === "model" && !unsure && (
                    <span title={attribution(label)}>
                      <SparklesIcon aria-hidden="true" className="size-3" />
                      <span className="sr-only">{attribution(label)}</span>
                    </span>
                  )}
                  {unsure && (
                    <span title={attribution(label)} className="text-[10px]">
                      Unsure {Math.round((label.confidence ?? 0) * 100)}%
                    </span>
                  )}
                  {unsure && (
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Keep ${label.name}`}
                      disabled={pending === label._id}
                      onClick={() => void onKeep(label._id)}
                    >
                      Keep
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size={unsure ? "xs" : "icon-xs"}
                    className={unsure ? "text-current" : "size-6 text-current"}
                    aria-label={`Remove ${label.name}`}
                    disabled={pending === label._id}
                    onClick={() => void onRemove(label._id)}
                  >
                    {unsure ? "Remove" : <XIcon aria-hidden="true" />}
                  </Button>
                </LabelTag>
              </li>
            );
          })}
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
