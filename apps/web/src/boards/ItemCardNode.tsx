import { memo, useState } from "react";
import { Handle, Position, NodeResizer, NodeToolbar } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { Button } from "@mindspool/ui/components/button";
import type { BoardPreview } from "./types";
import { cardHeight, finishResize } from "./cardGeometry";
import type { ItemData } from "./cardGeometry";
export type CardNode = Node<
  {
    card: ItemData;
    preview?: BoardPreview;
    open: () => void;
    remove: () => void;
    update: (card: ItemData) => void;
    connecting: boolean;
    disabled: boolean;
  },
  "item"
>;
export function ItemCardContent({
  card,
  preview,
  open,
}: {
  card: ItemData;
  preview?: BoardPreview;
  open: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const media = Boolean(preview?.imageUrl);
  const showImage = media && card.mode !== "text";
  const showText = !media || card.mode !== "image";
  return (
    <div
      className="overflow-hidden bg-card shadow-sm"
      style={{ height: cardHeight(card, media) }}
    >
      {showImage && (
        <div className="bg-muted" style={{ height: card.imageHeight }}>
          {failed ? (
            <p className="p-3 text-xs text-muted-foreground">
              Image unavailable
            </p>
          ) : (
            <img
              src={preview!.imageUrl!}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setFailed(true)}
            />
          )}
        </div>
      )}
      {showText && (
        <div
          data-testid="card-text"
          className="flex flex-col gap-1.5 overflow-hidden px-3.5 py-3"
          style={{ height: card.textHeight }}
        >
          <p className="text-[11px] text-muted-foreground">
            {preview?.source ?? "Saved item"}
          </p>
          <h3 className="line-clamp-2 text-[15px] font-medium">
            {preview?.title ?? "Loading preview…"}
          </h3>
          <p className="line-clamp-3 text-xs text-muted-foreground">
            {preview?.body}
          </p>
          {card.mode === "image" && !media && (
            <p className="text-xs">No image attached; showing text.</p>
          )}
        </div>
      )}
      <button
        aria-label="Open details"
        className="nodrag absolute right-1 bottom-1 bg-card/90 px-1 text-xs focus-visible:outline-2 focus-visible:outline-primary"
        onClick={open}
      >
        ↗
      </button>
    </div>
  );
}
export const ItemCardNode = memo(function ItemCardNode({
  data,
  selected,
}: NodeProps<CardNode>) {
  const { card, preview } = data;
  const media = Boolean(preview?.imageUrl);
  return (
    <div className={selected ? "ring-2 ring-primary" : "border border-border"}>
      <NodeResizer
        color="var(--primary)"
        handleStyle={{
          width: 9,
          height: 9,
          borderWidth: 2,
          background: "var(--background)",
          borderRadius: 0,
        }}
        isVisible={selected && !data.disabled}
        minWidth={160}
        minHeight={card.mode === "combined" && media ? 160 : 80}
        maxWidth={10000}
        maxHeight={10000}
        onResizeEnd={(_, params) =>
          data.update(finishResize(card, params, media))
        }
      />
      <NodeToolbar
        isVisible={selected}
        className="nodrag flex gap-1 bg-card p-1 shadow-md"
      >
        <Button variant="ghost" size="sm" onClick={data.open}>
          Details
        </Button>
        <select
          aria-label="Card display"
          disabled={data.disabled}
          value={card.mode}
          className="bg-card text-xs"
          onChange={(e) =>
            data.update({ ...card, mode: e.target.value as ItemData["mode"] })
          }
        >
          <option value="combined">Combined</option>
          <option value="image" disabled={!media}>
            Image only
          </option>
          <option value="text">Text only</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          disabled={data.disabled}
          onClick={data.remove}
        >
          Remove from board
        </Button>
      </NodeToolbar>
      <ItemCardContent card={card} preview={preview} open={data.open} />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={data.connecting && !data.disabled}
        style={{ opacity: data.connecting || selected ? 1 : 0 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={data.connecting && !data.disabled}
        style={{ opacity: data.connecting || selected ? 1 : 0 }}
      />
    </div>
  );
});
