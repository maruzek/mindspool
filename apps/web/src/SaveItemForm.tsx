import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { ItemInputType } from "@mindspool/schema";
import type { Id } from "@mindspool/backend/data-model";
import { errorMessage } from "./errors";

export function SaveItemForm({
  onSaved,
}: {
  onSaved: (id: Id<"items">) => void;
}) {
  const create = useMutation(api.items.create);
  const [inputType, setInputType] = useState<ItemInputType>("url");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const attempt = useRef<{
    input: string;
    type: ItemInputType;
    key: string;
  } | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !input.trim()) return;
    if (
      attempt.current?.input !== input ||
      attempt.current.type !== inputType
    ) {
      attempt.current = { input, type: inputType, key: crypto.randomUUID() };
    }
    setPending(true);
    setError("");
    setSuccess(false);
    try {
      const id = await create({
        inputType,
        originalInput: input,
        captureSource: "web",
        captureKey: attempt.current.key,
      });
      setInput("");
      attempt.current = null;
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
              onChange={() => setInputType("url")}
            />{" "}
            Link
          </label>
          <label>
            <input
              type="radio"
              name="inputType"
              checked={inputType === "text"}
              onChange={() => setInputType("text")}
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
            setInput(event.target.value);
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
