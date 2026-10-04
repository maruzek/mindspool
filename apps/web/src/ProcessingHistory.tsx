import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";

export function ProcessingHistory({ itemId }: { itemId: Id<"items"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.processingRuns.listForItem,
    { itemId },
    { initialNumItems: 10 },
  );
  return (
    <section aria-labelledby="processing-heading">
      <h3 id="processing-heading">Processing history</h3>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading processing history…</p>
      ) : !results.length ? (
        <p>No processing attempts yet.</p>
      ) : (
        <ul className="processing-list">
          {results.map((run) => (
            <li key={run._id}>
              <strong>
                {run.kind === "decision" ? "Labeling" : "Enrichment"} ·{" "}
                {run.status}
              </strong>
              <p className="muted">
                {run.model ||
                  run.provider ||
                  (run.kind === "enrichment"
                    ? "Metadata processing"
                    : "Provider not recorded")}{" "}
                · {run.questionVersion}
                {run.rubricVersion && ` · ${run.rubricVersion}`}
              </p>
              {run.error && <p>{run.error}</p>}
              {run.suggestedLabels.length > 0 && (
                <p>
                  Suggested labels:{" "}
                  {run.suggestedLabels.map((label) => label.name).join(", ")}.
                  Your assigned labels are unchanged.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(10)}>More processing history</button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more history…</p>}
    </section>
  );
}
