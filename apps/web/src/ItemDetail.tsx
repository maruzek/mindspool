import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";

export function ItemDetail({
  id,
  onClose,
}: {
  id: Id<"items">;
  onClose: () => void;
}) {
  const item = useQuery(api.items.get, { id });
  if (!item) return <p role="status">Loading item…</p>;
  return (
    <section className="item-detail" aria-labelledby="item-heading">
      <button onClick={onClose}>Back to items</button>
      <h2 id="item-heading">{item.sourceMetadata?.title || "Saved item"}</h2>
      <p className="muted">
        {item.inputType === "url" ? "Link" : "Text"} · Saved{" "}
        {new Date(item._creationTime).toLocaleString()}
      </p>
      <pre className="original-input">{item.originalInput}</pre>
      {item.originalUrl && (
        <a href={item.originalUrl} target="_blank" rel="noreferrer">
          Open original link ↗
        </a>
      )}
      <p>Enrichment: {item.enrichmentStatus.replaceAll("_", " ")}</p>
    </section>
  );
}
