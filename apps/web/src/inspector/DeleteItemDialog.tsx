import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@mindspool/ui/components/dialog";
import { errorMessage } from "../errors";

/**
 * Confirm-then-delete. `onDeleting` lets the panel hold back its "Not found"
 * notice while the reactive query catches up; `onDeleted` closes the panel.
 */
export function DeleteItemDialog({
  itemId,
  onDeleting,
  onDeleted,
}: {
  itemId: Id<"items">;
  onDeleting: (deleting: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = useMutation(api.items.remove);
  const cancel = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    onDeleting(true);
    try {
      await remove({ id: itemId });
      setOpen(false);
      onDeleted();
    } catch (caught) {
      onDeleting(false);
      setError(errorMessage(caught, "Could not delete the item."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" className="self-start" />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent showCloseButton={false} initialFocus={cancel}>
        <DialogHeader>
          <DialogTitle>Delete this item?</DialogTitle>
          <DialogDescription>
            Its original and label links are removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            ref={cancel}
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
