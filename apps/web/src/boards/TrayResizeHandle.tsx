import { useRef } from "react";
import { GripHorizontal } from "lucide-react";

export function TrayResizeHandle({
  height,
  onHeight,
}: {
  height: number;
  onHeight: (height: number) => void;
}) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  return (
    <div
      role="separator"
      aria-label="Resize library tray"
      aria-orientation="horizontal"
      aria-valuemin={160}
      aria-valuemax={440}
      aria-valuenow={height}
      tabIndex={0}
      title="Drag to resize, or use the up and down arrow keys"
      className="flex h-4 shrink-0 touch-none cursor-row-resize items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { y: event.clientY, height };
      }}
      onPointerMove={(event) => {
        if (drag.current)
          onHeight(drag.current.height + drag.current.y - event.clientY);
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        const next =
          event.key === "ArrowUp"
            ? height + 20
            : event.key === "ArrowDown"
              ? height - 20
              : event.key === "Home"
                ? 160
                : event.key === "End"
                  ? 440
                  : undefined;
        if (next !== undefined) {
          event.preventDefault();
          onHeight(next);
        }
      }}
    >
      <GripHorizontal className="size-4" />
    </div>
  );
}
