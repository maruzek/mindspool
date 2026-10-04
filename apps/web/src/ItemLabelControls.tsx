import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Doc, Id } from "@mindspool/backend/data-model";
import { errorMessage } from "./errors";

export function ItemLabelControls({
  itemId,
  onLabelSelect,
}: {
  itemId: Id<"items">;
  onLabelSelect: (label: Doc<"labels">) => void;
}) {
  const assigned = usePaginatedQuery(
    api.itemLabels.listForItem,
    { itemId },
    { initialNumItems: 20 },
  );
  const choices = usePaginatedQuery(
    api.itemLabels.availableLabels,
    { itemId },
    { initialNumItems: 20 },
  );
  const attach = useMutation(api.itemLabels.attach);
  const remove = useMutation(api.itemLabels.remove);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function toggle(labelId: Id<"labels">, isAssigned: boolean) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await (isAssigned ? remove : attach)({ itemId, labelId });
    } catch (cause) {
      setError(
        errorMessage(cause, "Could not update this item's labels. Try again."),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-labelledby="item-labels-heading">
      <h3 id="item-labels-heading">Labels on this item</h3>
      {assigned.status === "LoadingFirstPage" ? (
        <p role="status">Loading assigned labels…</p>
      ) : assigned.results.length ? (
        <ul className="label-chips">
          {assigned.results.map((label) => (
            <li key={label._id}>
              <button onClick={() => onLabelSelect(label)}>{label.name}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No labels assigned yet.</p>
      )}
      {assigned.status === "CanLoadMore" && (
        <button onClick={() => assigned.loadMore(20)}>
          More assigned labels
        </button>
      )}
      {assigned.status === "LoadingMore" && (
        <p role="status">Loading more assigned labels…</p>
      )}
      <fieldset disabled={pending}>
        <legend>Assign labels</legend>
        {choices.results.map((label) => (
          <label className="label-choice" key={label._id}>
            <input
              type="checkbox"
              checked={label.isAssigned}
              onChange={() => void toggle(label._id, label.isAssigned)}
            />
            {label.name}
          </label>
        ))}
        {choices.status === "LoadingFirstPage" && (
          <p role="status">Loading label choices…</p>
        )}
        {choices.status === "Exhausted" && !choices.results.length && (
          <p>Create a label using the Labels panel.</p>
        )}
        {choices.status === "CanLoadMore" && (
          <button onClick={() => choices.loadMore(20)}>
            More label choices
          </button>
        )}
        {choices.status === "LoadingMore" && (
          <p role="status">Loading more label choices…</p>
        )}
      </fieldset>
      {pending && <p role="status">Updating labels…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
