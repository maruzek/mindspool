import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Doc, Id } from "@mindspool/backend/data-model";
import { ItemLabelControls } from "./ItemLabelControls";
import { ProcessingHistory } from "./ProcessingHistory";

export function ItemDetail({
  id,
  onClose,
  onLabelSelect,
}: {
  id: Id<"items">;
  onClose: () => void;
  onLabelSelect: (label: Doc<"labels">) => void;
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
      {item.imageAssets.length > 0 && (
        <section aria-labelledby="images-heading">
          <h3 id="images-heading">Image references</h3>
          <ul>
            {item.imageAssets.map((asset, index) => (
              <li key={index}>
                {asset.kind === "external" ? (
                  <a href={asset.url} target="_blank" rel="noreferrer">
                    {asset.purpose} reference ↗
                  </a>
                ) : (
                  <span>{asset.purpose} stored asset</span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted">
            References describe images; they do not confirm an image has been
            downloaded.
          </p>
        </section>
      )}
      <ItemLabelControls itemId={id} onLabelSelect={onLabelSelect} />
      <ProcessingHistory itemId={id} />
    </section>
  );
}
