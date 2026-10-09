import {
  Columns3,
  Hand,
  MousePointer2,
  StickyNote,
  Type,
  ArrowUpRight,
  Minus,
  Plus,
  Maximize2,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@mindspool/ui/components/button";
export type Tool = "select" | "pan" | "connect";
export function BoardControls({
  tool,
  setTool,
  status,
  message,
  retry,
  reload,
  zoom,
  onZoom,
  fit,
  undo,
  redo,
  canUndo,
  canRedo,
  disabled,
  create,
}: {
  tool: Tool;
  setTool: (tool: Tool) => void;
  status: string;
  message?: string;
  retry: () => void;
  reload: () => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  fit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  create: (type: "note" | "heading" | "column") => void;
}) {
  return (
    <>
      <div
        className="absolute left-5 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-0.5 bg-card p-1.5 shadow-md"
        role="toolbar"
        aria-label="Board tools"
      >
        {(
          [
            { value: "select", label: "Select", Icon: MousePointer2 },
            { value: "pan", label: "Pan", Icon: Hand },
            { value: "connect", label: "Connect", Icon: ArrowUpRight },
          ] as const
        ).map(({ value, label, Icon }) => (
          <Button
            key={value}
            size="icon"
            variant={tool === value ? "secondary" : "ghost"}
            title={label}
            aria-label={label}
            aria-pressed={tool === value}
            onClick={() => setTool(value)}
          >
            <Icon />
          </Button>
        ))}
        {(
          [
            { type: "note", label: "New note", Icon: StickyNote },
            { type: "heading", label: "Heading", Icon: Type },
            { type: "column", label: "Column", Icon: Columns3 },
          ] as const
        ).map(({ type, label, Icon }) => (
          <Button
            key={type}
            size="icon"
            variant="ghost"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={() => create(type)}
          >
            <Icon />
          </Button>
        ))}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Undo"
          disabled={disabled || !canUndo}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Redo"
          disabled={disabled || !canRedo}
          onClick={redo}
        >
          <Redo2 />
        </Button>
      </div>
      <div
        className="absolute right-5 top-3 z-10 flex items-center gap-2 bg-background/90 px-3 py-1 text-xs"
        role="status"
      >
        {status === "saving"
          ? "Saving…"
          : status === "error"
            ? "Couldn't save"
            : status === "conflict"
              ? "Board changed in another session"
              : "Saved"}
        {message && (
          <span className="max-w-64 truncate" title={message}>
            {message}
          </span>
        )}
        {status === "error" && (
          <Button size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        )}
        {(status === "conflict" || status === "error") && (
          <Button size="sm" variant="outline" onClick={reload}>
            Reload latest
          </Button>
        )}
      </div>
      <div
        className="absolute right-5 bottom-4 z-10 flex items-center gap-1 bg-card p-1 shadow-md"
        role="toolbar"
        aria-label="Zoom"
      >
        <Button
          size="icon"
          variant="ghost"
          aria-label="Zoom out"
          onClick={() => onZoom(Math.max(0.25, zoom / 1.25))}
        >
          <Minus />
        </Button>
        <span className="w-12 text-center text-xs">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Zoom in"
          onClick={() => onZoom(Math.min(2, zoom * 1.25))}
        >
          <Plus />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Fit to content"
          onClick={fit}
        >
          <Maximize2 />
        </Button>
      </div>
    </>
  );
}
