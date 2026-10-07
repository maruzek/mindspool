import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Button } from "@mindspool/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mindspool/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@mindspool/ui/components/field";
import { Input } from "@mindspool/ui/components/input";
import { Textarea } from "@mindspool/ui/components/textarea";
import { errorMessage } from "../errors";
import { DESCRIPTION_HELP, MAX_DESCRIPTION } from "./LabelDescription";

const MAX_NAME = 80;

/**
 * Creates a label, then opens it. Names are reused case-insensitively by the
 * backend, so typing an existing name simply opens that label.
 */
export function CreateLabelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.labels.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function change(next: boolean) {
    if (pending) return;
    if (!next) {
      setName("");
      setDescription("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a label name.");
    if (trimmed.length > MAX_NAME)
      return setError(`Use ${MAX_NAME} characters or fewer.`);
    const note = description.trim();
    if (description && !note)
      return setError("Enter a description or clear it.");
    if (note.length > MAX_DESCRIPTION)
      return setError(`Use ${MAX_DESCRIPTION} characters or fewer.`);
    setPending(true);
    setError("");
    try {
      const labelId = await create({
        name: trimmed,
        ...(note && { description: note }),
      });
      setName("");
      setDescription("");
      onOpenChange(false);
      await navigate({ to: "/labels/$labelId", params: { labelId } });
    } catch (cause) {
      setError(errorMessage(cause, "Could not create the label. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New label</DialogTitle>
            <DialogDescription>
              A label is a collection. An item can belong to several.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="new-label-name">Name</FieldLabel>
            <Input
              id="new-label-name"
              value={name}
              maxLength={MAX_NAME}
              disabled={pending}
              autoFocus
              aria-invalid={error ? true : undefined}
              placeholder="e.g. Recipes"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-label-description">
              Description (optional)
            </FieldLabel>
            <Textarea
              id="new-label-description"
              value={description}
              maxLength={MAX_DESCRIPTION}
              disabled={pending}
              placeholder="What belongs in this label?"
              aria-describedby="new-label-description-help"
              onChange={(event) => setDescription(event.target.value)}
            />
            <p
              id="new-label-description-help"
              className="text-xs text-muted-foreground"
            >
              {DESCRIPTION_HELP}
            </p>
          </Field>
          {error && <FieldError role="alert">{error}</FieldError>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create label"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
