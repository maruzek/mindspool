import { memo, useEffect, useState } from "react";
import { NodeToolbar } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { Button } from "@mindspool/ui/components/button";
export function HeadingControl({
  text,
  update,
  disabled,
}: {
  text: string;
  update: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);
  return (
    <input
      aria-label="Heading text"
      className="nodrag bg-card px-2 py-1 text-sm"
      value={value}
      maxLength={200}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() && value !== text) update(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
export type HeadingFlowNode = Node<
  {
    text: string;
    update: (text: string) => void;
    remove: () => void;
    disabled: boolean;
  },
  "heading"
>;
export const HeadingNode = memo(function HeadingNode({
  data,
  selected,
}: NodeProps<HeadingFlowNode>) {
  return (
    <div className={selected ? "ring-2 ring-primary" : ""}>
      <div className="font-heading text-[42px] leading-none font-extrabold tracking-[-0.02em] break-words">
        {data.text}
      </div>
      <NodeToolbar
        isVisible={selected}
        className="flex gap-1 bg-card p-1 shadow-md"
      >
        <HeadingControl {...data} />
        <Button
          size="sm"
          variant="ghost"
          disabled={data.disabled}
          onClick={data.remove}
        >
          Remove heading
        </Button>
      </NodeToolbar>
    </div>
  );
});
