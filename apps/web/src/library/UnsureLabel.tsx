import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@mindspool/ui/components/button";
import { LabelTag } from "@mindspool/ui/components/mindspool/label-tag";
import { useUnsureActions } from "./useUnsureActions";
import type { Decision, UnsureLabelPreview } from "./useUnsureActions";

/**
 * A model label the owner has not confirmed, with Keep and Remove in place so
 * the list can be triaged without opening the inspector. Sits above the row's
 * stretched link (`relative z-10`).
 */
export function UnsureLabel({
  itemId,
  label,
}: {
  itemId: string;
  label: UnsureLabelPreview;
}) {
  const decide = useUnsureActions();
  const [busy, setBusy] = useState(false);

  async function onDecide(decision: Decision) {
    setBusy(true);
    try {
      await decide(decision, itemId, [label]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <LabelTag state="suggested" className="relative z-10 pr-0.5">
      {label.name}
      <span className="sr-only"> (unsure)</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-5 text-current hover:bg-primary hover:text-primary-foreground"
        aria-label={`Keep ${label.name}`}
        title="Keep (Y)"
        disabled={busy}
        onClick={() => void onDecide("keep")}
      >
        <CheckIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-5 text-current hover:bg-destructive/15 hover:text-destructive"
        aria-label={`Remove ${label.name}`}
        title="Remove (N)"
        disabled={busy}
        onClick={() => void onDecide("remove")}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </LabelTag>
  );
}
