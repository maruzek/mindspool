import { useState } from "react";
import type { Doc, Id } from "@mindspool/backend/data-model";
import { SaveItemForm } from "./SaveItemForm";
import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { ItemList } from "./ItemList";
import { ItemDetail } from "./ItemDetail";
import { LabelList } from "./LabelList";

export function Workspace() {
  const [itemId, setItemId] = useState<Id<"items"> | null>(null);
  const [label, setLabel] = useState<Doc<"labels"> | null>(null);
  const allItems = usePaginatedQuery(api.items.list, label ? "skip" : {}, {
    initialNumItems: 20,
  });
  const labelledItems = usePaginatedQuery(
    api.itemLabels.listItemsForLabel,
    label ? { labelId: label._id } : "skip",
    { initialNumItems: 20 },
  );
  const { results, status, loadMore } = label ? labelledItems : allItems;
  function selectLabel(selected: Doc<"labels"> | null) {
    setLabel(selected);
    setItemId(null);
  }
  return (
    <>
      <SaveItemForm onSaved={setItemId} />
      <div className="library-layout">
        <LabelList selectedId={label?._id ?? null} onSelect={selectLabel} />
        <div>
          {itemId ? (
            <ItemDetail
              key={itemId}
              id={itemId}
              onClose={() => setItemId(null)}
              onLabelSelect={selectLabel}
            />
          ) : (
            <section aria-labelledby="inbox-heading">
              <h2 id="inbox-heading">{label ? label.name : "All items"}</h2>
              {status === "LoadingFirstPage" ? (
                <p role="status">Loading your items…</p>
              ) : (
                <ItemList items={results} onOpen={setItemId} />
              )}
              {status === "CanLoadMore" && (
                <button onClick={() => loadMore(20)}>Load more items</button>
              )}
              {status === "LoadingMore" && (
                <p role="status">Loading more items…</p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
