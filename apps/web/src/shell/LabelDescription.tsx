import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import { Field, FieldError, FieldLabel } from "@mindspool/ui/components/field";
import { Textarea } from "@mindspool/ui/components/textarea";
import { errorMessage } from "../errors";

export const MAX_DESCRIPTION = 500;
export const DESCRIPTION_HELP =
  "Sent to the model as context when it suggests labels.";

/** Muted description under a label heading, with an inline edit form. */
export function LabelDescription({
  labelId,
  description,
}: {
  labelId: Id<"labels">;
  description?: string;
}) {
  const update = useMutation(api.labels.update);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setDraft(description ?? "");
    setError("");
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = draft.trim();
    if (draft && !trimmed) return setError("Enter a description or clear it.");
    if (trimmed.length > MAX_DESCRIPTION)
      return setError(`Use ${MAX_DESCRIPTION} characters or fewer.`);
    setPending(true);
    setError("");
    try {
      await update({ id: labelId, description: trimmed });
      setEditing(false);
    } catch (cause) {
      // The draft stays so nothing typed is lost.
      setError(errorMessage(cause, "Could not save the description."));
    } finally {
      setPending(false);
    }
  }

  if (!editing)
    return (
      <div className="flex items-baseline gap-3">
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={open}>
          {description ? "Edit description" : "Add description"}
        </Button>
      </div>
    );
  return (
    <form onSubmit={save} className="grid max-w-prose gap-2" noValidate>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="label-description">Description</FieldLabel>
        <Textarea
          id="label-description"
          value={draft}
          disabled={pending}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby="label-description-help"
          onChange={(event) => setDraft(event.target.value)}
        />
        <p
          id="label-description-help"
          className="text-xs text-muted-foreground"
        >
          {DESCRIPTION_HELP} {draft.length}/{MAX_DESCRIPTION}
        </p>
        {error && <FieldError role="alert">{error}</FieldError>}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
