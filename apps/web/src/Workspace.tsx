import { useState } from "react";
import type { Id } from "@mindspool/backend/data-model";
import { SaveItemForm } from "./SaveItemForm";
import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { ItemList } from "./ItemList";
import { ItemDetail } from "./ItemDetail";

export function Workspace() {
  const [itemId, setItemId] = useState<Id<"items"> | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.items.list,
    {},
    { initialNumItems: 20 },
  );
  return (
    <>
      <SaveItemForm onSaved={setItemId} />
      {itemId ? (
        <ItemDetail id={itemId} onClose={() => setItemId(null)} />
      ) : (
        <section aria-labelledby="inbox-heading">
          <h2 id="inbox-heading">All items</h2>
          {status === "LoadingFirstPage" ? (
            <p role="status">Loading your items…</p>
          ) : (
            <ItemList items={results} onOpen={setItemId} />
          )}
          {status === "CanLoadMore" && (
            <button onClick={() => loadMore(20)}>Load more items</button>
          )}
          {status === "LoadingMore" && <p role="status">Loading more items…</p>}
        </section>
      )}
    </>
  );
}
