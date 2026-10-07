import { ItemThumb } from "@mindspool/ui/components/mindspool/item-thumb";
import { displayTitle, kindOf } from "../library/itemDisplay";
import type { ItemDetail } from "./types";
import { savedLine } from "./savedLine";

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** Kind tile, title, saved line and the stored content. Text is never HTML. */
export function InspectorPreview({ item }: { item: ItemDetail }) {
  const kind = kindOf(item);
  const meta = item.sourceMetadata;
  const url = item.originalUrl ?? item.originalInput;
  const images = (item.imageAssets ?? []).flatMap((asset) =>
    asset.kind === "external" ? [asset.url] : [],
  );
  return (
    <div className="flex flex-col gap-4">
      <ItemThumb kind={kind} className="h-32 w-full" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg break-words">{displayTitle(item)}</h2>
        <p className="text-sm text-muted-foreground">{savedLine(item)}</p>
      </div>
      {kind === "note" ? (
        <div
          data-slot="note-text"
          tabIndex={0}
          aria-label="Note text"
          className="max-h-80 overflow-auto text-sm break-words whitespace-pre-wrap"
        >
          {item.originalInput}
        </div>
      ) : (
        <dl className="flex flex-col gap-3">
          <Fact label="URL">{url}</Fact>
          {item.canonicalUrl && item.canonicalUrl !== url && (
            <Fact label="Canonical URL">{item.canonicalUrl}</Fact>
          )}
          {meta?.description && (
            <Fact label="Description">{meta.description}</Fact>
          )}
          {meta?.author && <Fact label="Author">{meta.author}</Fact>}
          {meta?.siteName && <Fact label="Site">{meta.siteName}</Fact>}
        </dl>
      )}
      {kind === "link" && item.extractedText && (
        <div
          tabIndex={0}
          aria-label="Text"
          className="max-h-80 overflow-auto text-sm break-words whitespace-pre-wrap"
        >
          {item.extractedText}
        </div>
      )}
      {kind === "link" && images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((src) => (
            // Referenced from its source, never fetched or stored by us.
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="aspect-square w-full border object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
