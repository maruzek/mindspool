import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Button } from "@mindspool/ui/components/button";
import { Textarea } from "@mindspool/ui/components/textarea";
import { useCaptureDraftContext } from "../capture/CaptureDraftProvider";
import { errorMessage } from "../errors";
import { CAPTURE_LIMITS, captureTypeOf } from "./itemDisplay";

/**
 * One input for links and notes. The original text is stored verbatim; the
 * capture key stays with the draft so a retry after a failure never duplicates.
 */
export function CaptureBar({
  onSaved,
}: {
  onSaved?: (itemId: string) => void;
}) {
  const { draft, setDraft, captured } = useCaptureDraftContext();
  const createItem = useMutation(api.items.create);
  const field = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const feedbackId = useId();

  const input = draft.originalInput;
  const inputType = captureTypeOf(input);
  const limit = CAPTURE_LIMITS[inputType];
  const tooLong = input.length > limit;
  const canSave = input.trim() !== "" && !tooLong && !saving;

  async function save() {
    if (!canSave) return;
    const captureKey = draft.captureKey ?? crypto.randomUUID();
    if (draft.captureKey === null)
      setDraft((current) => ({ ...current, captureKey }));
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const itemId = await createItem({
        originalInput: input,
        inputType,
        captureSource: "web",
        captureKey,
      });
      captured(captureKey);
      onSaved?.(itemId);
      setSaved(true);
      field.current?.focus();
    } catch (cause) {
      setError(
        errorMessage(cause, "Could not save. Your input is kept; try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    void save();
  }

  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Textarea
          ref={field}
          aria-label="Capture a link or note"
          aria-describedby={feedbackId}
          aria-invalid={tooLong || error !== null}
          placeholder="Paste a link or write a note…"
          rows={1}
          className="max-h-60 min-h-10 resize-none"
          value={input}
          onChange={(event) => {
            setError(null);
            setSaved(false);
            setDraft({ originalInput: event.target.value, captureKey: null });
          }}
          onKeyDown={onKeyDown}
        />
        <div id={feedbackId} className="text-sm">
          {tooLong && (
            <p role="alert" className="text-destructive">
              {inputType === "url" ? "Links" : "Notes"} can be at most{" "}
              {limit.toLocaleString("en-US")} characters.
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <p role="status" className="text-muted-foreground">
            {saved ? "Saved" : ""}
          </p>
        </div>
      </div>
      <Button type="submit" disabled={!canSave}>
        Save
      </Button>
    </form>
  );
}
