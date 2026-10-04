import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { errorMessage } from "./errors";

export function LoadExamples() {
  const availability = useQuery(api.seed.availability);
  const load = useMutation(api.seed.load);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!availability?.enabled) return null;
  async function loadExamples() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await load({});
      setMessage(
        result.createdItems
          ? `Added ${result.createdItems} examples.`
          : "Examples are already in your library.",
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not load examples. Try again."));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="examples-panel">
      <button disabled={pending} onClick={loadExamples}>
        {pending ? "Loading examples…" : "Load examples"}
      </button>
      <span className="muted">A few ideas and links to explore labels.</span>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
