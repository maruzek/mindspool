import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@mindspool/ui/components/dialog";
import { Input } from "@mindspool/ui/components/input";
import { Button } from "@mindspool/ui/components/button";
export function OrganizationDialog({
  type,
  create,
  close,
}: {
  type: "heading" | "column";
  create: (text: string) => void;
  close: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {type}</DialogTitle>
          <DialogDescription>Add organization to this board.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) create(text);
          }}
        >
          <Input
            aria-label={type === "column" ? "Column title" : "Heading text"}
            autoFocus
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button disabled={!text.trim()}>Create {type}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
