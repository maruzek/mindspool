import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Doc } from "@mindspool/backend/data-model";
import { errorMessage } from "./errors";

export function LabelList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (label: Doc<"labels"> | null) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.labels.list,
    {},
    { initialNumItems: 20 },
  );
  const create = useMutation(api.labels.create);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true);
    setError("");
    try {
      await create({ name });
      setName("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not create the label. Try again."));
    } finally {
      setPending(false);
    }
  }
  return (
    <aside className="labels" aria-labelledby="labels-heading">
      <h2 id="labels-heading">Labels</h2>
      <nav aria-label="Library labels">
        <button
          aria-current={!selectedId ? "page" : undefined}
          onClick={() => onSelect(null)}
        >
          All items
        </button>
        {results.map((label) => (
          <button
            key={label._id}
            aria-current={selectedId === label._id ? "page" : undefined}
            onClick={() => onSelect(label)}
          >
            {label.name}
          </button>
        ))}
      </nav>
      {status === "LoadingFirstPage" && <p role="status">Loading labels…</p>}
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(20)}>More labels</button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more labels…</p>}
      <form onSubmit={submit}>
        <label htmlFor="new-label">New label</label>
        <input
          id="new-label"
          value={name}
          maxLength={80}
          required
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Recipes"
        />
        <button disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create label"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
