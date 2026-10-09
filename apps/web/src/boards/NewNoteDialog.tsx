import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mindspool/ui/components/dialog";
import { Button } from "@mindspool/ui/components/button";
import { Textarea } from "@mindspool/ui/components/textarea";
export function NewNoteDialog({
  onCreate,
  onClose,
  status,
  onRetry,
  onReload,
}: {
  onCreate: (text: string) => void;
  onClose: () => void;
  status: string;
  onRetry?: () => void;
  onReload?: () => void;
}) {
  const [text, setText] = useState("");
  const saving = status === "saving";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>New note</DialogTitle>
          <DialogDescription>
            Save a plain-text note to your library and this label board.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="board-note">Note text</label>
        <Textarea
          id="board-note"
          autoFocus
          maxLength={100000}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />
        {(status === "error" || status === "conflict") && (
          <p role="alert">
            Couldn't save the note. Your draft is kept. Retry, or reload to
            discard the failed board action and keep editing this note.
          </p>
        )}
        <DialogFooter>
          {status === "error" && onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
          {(status === "error" || status === "conflict") && onReload && (
            <Button variant="outline" onClick={onReload}>
              Reload latest
            </Button>
          )}
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !text.trim() ||
              saving ||
              status === "error" ||
              status === "conflict"
            }
            onClick={() => onCreate(text)}
          >
            {saving ? "Creating…" : "Create note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
