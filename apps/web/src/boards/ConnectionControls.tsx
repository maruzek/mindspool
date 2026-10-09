import { useEffect, useState } from "react";
import { Button } from "@mindspool/ui/components/button";
import type { Connection } from "./types";
export function ConnectionControls({
  connection,
  update,
  remove,
  disabled,
}: {
  connection: Connection;
  update: (
    patch: Partial<Pick<Connection, "arrows" | "color" | "label">>,
  ) => void;
  remove: () => void;
  disabled: boolean;
}) {
  const [label, setLabel] = useState(connection.label);
  useEffect(() => setLabel(connection.label), [connection.label]);
  return (
    <div className="nodrag nopan flex gap-2 bg-card p-2 shadow-md">
      <select
        aria-label="Connection arrows"
        className="bg-card text-xs"
        value={connection.arrows}
        disabled={disabled}
        onChange={(e) =>
          update({ arrows: e.target.value as Connection["arrows"] })
        }
      >
        <option value="none">None</option>
        <option value="end">End</option>
        <option value="both">Both</option>
      </select>
      <input
        aria-label="Connection label"
        className="w-32 bg-background px-2 text-xs"
        maxLength={200}
        value={label}
        disabled={disabled}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label !== connection.label) update({ label });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <select
        aria-label="Connection color"
        className="bg-card text-xs"
        value={connection.color}
        disabled={disabled}
        onChange={(e) =>
          update({ color: e.target.value as Connection["color"] })
        }
      >
        <option value="ink">Ink</option>
        <option value="accent">Accent</option>
        <option value="secondary">Secondary</option>
      </select>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={remove}>
        Remove connection
      </Button>
    </div>
  );
}
