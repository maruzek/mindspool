import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { errorMessage } from "./errors";
import type { CaptureDraft } from "./captureDraft";

export function SaveItemForm({
  onSaved,
  draft,
  onDraftChange,
  onCaptured,
}: {
  onSaved: (id: Id<"items">) => void;
  draft: CaptureDraft;
  onDraftChange: (draft: CaptureDraft) => void;
  onCaptured: (key: string) => void;
}) {
  const create = useMutation(api.items.create);
  const { inputType, originalInput: input } = draft;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !input.trim()) return;
    const captureKey = draft.captureKey ?? crypto.randomUUID();
    onDraftChange({ ...draft, captureKey });
    setPending(true);
    setError("");
    setSuccess(false);
    try {
      const id = await create({
        inputType,
        originalInput: input,
        captureSource: "web",
        captureKey,
      });
      onCaptured(captureKey);
      setSuccess(true);
      onSaved(id);
    } catch (cause) {
      setError(
        errorMessage(
          cause,
          "Could not save your item. Your input is kept; try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="save-panel" aria-labelledby="save-heading">
      <h2 id="save-heading">Save something worth keeping</h2>
      <form onSubmit={save}>
        <fieldset disabled={pending}>
          <legend>What are you saving?</legend>
          <label>
            <input
              type="radio"
              name="inputType"
              checked={inputType === "url"}
              onChange={() =>
                onDraftChange({ ...draft, inputType: "url", captureKey: null })
              }
            />{" "}
            Link
          </label>
          <label>
            <input
              type="radio"
              name="inputType"
              checked={inputType === "text"}
              onChange={() =>
                onDraftChange({ ...draft, inputType: "text", captureKey: null })
              }
            />{" "}
            Text or idea
          </label>
        </fieldset>
        <label htmlFor="save-input">
          {inputType === "url" ? "URL" : "Text"}
        </label>
        <textarea
          id="save-input"
          value={input}
          required
          disabled={pending}
          maxLength={inputType === "url" ? 8192 : 100000}
          rows={inputType === "url" ? 2 : 4}
          placeholder={
            inputType === "url" ? "https://…" : "An idea, quote, or note…"
          }
          onChange={(event) => {
            onDraftChange({
              ...draft,
              originalInput: event.target.value,
              captureKey: null,
            });
            setSuccess(false);
          }}
        />
        <button className="primary" disabled={pending || !input.trim()}>
          {pending ? "Saving…" : "Save item"}
        </button>
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">Item saved.</p>}
      </form>
    </section>
  );
}
