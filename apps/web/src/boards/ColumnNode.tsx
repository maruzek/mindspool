import { memo, useEffect, useState } from "react";
import { NodeToolbar } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { Button } from "@mindspool/ui/components/button";
export function ColumnControls({
  title,
  width,
  update,
  remove,
  note,
  disabled,
}: {
  title: string;
  width: number;
  update: (patch: { title?: string; width?: number }) => void;
  remove: () => void;
  note: () => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(title);
  const [size, setSize] = useState(width);
  useEffect(() => {
    setText(title);
    setSize(width);
  }, [title, width]);
  return (
    <div className="nodrag flex items-center gap-2 bg-card p-2 shadow-md">
      <input
        aria-label="Column title"
        className="w-32 bg-background px-2 text-sm"
        maxLength={200}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && text !== title) update({ title: text });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <label className="text-xs">
        Width
        <input
          aria-label="Column width"
          type="range"
          className="ml-2 w-20"
          min={192}
          max={1000}
          value={size}
          disabled={disabled}
          onChange={(e) => setSize(Number(e.target.value))}
          onPointerUp={() => {
            if (size !== width) update({ width: size });
          }}
          onKeyUp={() => {
            if (size !== width) update({ width: size });
          }}
        />
      </label>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={note}>
        New note here
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={remove}>
        Remove column
      </Button>
    </div>
  );
}
export type ColumnFlowNode = Node<
  {
    title: string;
    width: number;
    update: (patch: { title?: string; width?: number }) => void;
    remove: () => void;
    note: () => void;
    disabled: boolean;
    drop: boolean;
  },
  "column"
>;
export const ColumnNode = memo(function ColumnNode({
  data,
  selected,
}: NodeProps<ColumnFlowNode>) {
  return (
    <div
      className={`h-full border-2 bg-muted/50 ${selected || data.drop ? "border-primary" : "border-border"}`}
    >
      <div className="px-4 py-3 text-sm font-bold">{data.title}</div>
      {data.drop && (
        <p className="px-4 text-xs text-primary">Insert card here</p>
      )}
      <NodeToolbar isVisible={selected}>
        <ColumnControls {...data} />
      </NodeToolbar>
    </div>
  );
});
