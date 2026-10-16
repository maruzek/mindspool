import { useState } from "react";
import { ImageViewer } from "@mindspool/ui/components/mindspool/image-viewer";
import { ItemThumb } from "@mindspool/ui/components/mindspool/item-thumb";
import { displayTitle, hostOfItem, kindOf } from "@mindspool/schema";
import { BrandIcon } from "../library/BrandIcon";
import type { ItemDetail } from "./types";
import { savedLine } from "./savedLine";
import { RedditCapturePreview } from "./RedditCapturePreview";

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * The first image as a 16:9 header (the brand tile when there is none or it
 * fails to load), then a strip of the rest. Any of them opens the viewer.
 */
function Media({
  item,
  images,
  onOpen,
}: {
  item: ItemDetail;
  images: string[];
  onOpen: (index: number) => void;
}) {
  const kind = kindOf(item);
  const [failed, setFailed] = useState<string | null>(null);
  const hero = images[0];
  return (
    <div className="flex flex-col gap-2">
      {hero && failed !== hero ? (
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="block aspect-video w-full overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Referenced from its source, never fetched or stored by us. */}
          <img
            src={hero}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(hero)}
            className="size-full object-cover"
          />
          <span className="sr-only">Open image 1 of {images.length}</span>
        </button>
      ) : (
        <ItemThumb kind={kind} className="aspect-video h-auto w-full">
          <BrandIcon host={hostOfItem(item)} kind={kind} className="size-8" />
        </ItemThumb>
      )}
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.slice(1).map((src, offset) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => onOpen(offset + 1)}
                className="block size-16 overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
                <span className="sr-only">
                  Open image {offset + 2} of {images.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Media, title, saved line and the stored content. Text is never HTML. */
export function InspectorPreview({ item }: { item: ItemDetail }) {
  const kind = kindOf(item);
  const meta = item.sourceMetadata;
  const url = item.originalUrl ?? item.originalInput;
  const images = item.images ?? [];
  const [viewer, setViewer] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Media item={item} images={images} onOpen={setViewer} />
      <ImageViewer
        images={images}
        index={viewer ?? 0}
        onIndexChange={setViewer}
        open={viewer !== null}
        onOpenChange={(open) => !open && setViewer(null)}
      />
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
      {kind === "link" && item.redditCapture && (
        <RedditCapturePreview capture={item.redditCapture} />
      )}
      {kind === "link" && !item.redditCapture && item.extractedText && (
        <div
          tabIndex={0}
          aria-label="Text"
          className="max-h-80 overflow-auto text-sm break-words whitespace-pre-wrap"
        >
          {item.extractedText}
        </div>
      )}
    </div>
  );
}
