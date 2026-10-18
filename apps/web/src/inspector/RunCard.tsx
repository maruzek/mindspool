import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { ClassifyControl } from "./ClassifyControl";
import { Fact, FactList, SectionHeading } from "./Facts";
import {
  ProcessingStatus,
  type ProcessingState,
} from "@mindspool/ui/components/mindspool/processing-status";

const MODALITY = {
  text: "Text",
  image: "Image",
  text_image: "Text and image",
} as const;
const STATUS = {
  pending: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
} as const;

/** Facts of the latest processing run; fields without data are left out. */
export function RunCard({
  itemId,
  enrichmentStatus,
}: {
  itemId: Id<"items">;
  enrichmentStatus: ProcessingState;
}) {
  const { results, status } = usePaginatedQuery(
    api.processingRuns.listForItem,
    { itemId },
    { initialNumItems: 1 },
  );
  const run = results[0];
  const rows: [string, string | undefined][] = run
    ? [
        ["Provider", run.provider],
        ["Model", run.model],
        ["Input", MODALITY[run.modality]],
        ["Question version", run.questionVersion],
        [
          "Labels asked",
          run.labelsAsked === undefined
            ? undefined
            : run.labelsTotal !== undefined && run.labelsTotal > run.labelsAsked
              ? `${run.labelsAsked} of ${run.labelsTotal}`
              : String(run.labelsAsked),
        ],
        ["Status", STATUS[run.status]],
        ["Error", run.status === "failed" ? run.error : undefined],
        [
          "Latency",
          run.latencyMs === undefined ? undefined : `${run.latencyMs} ms`,
        ],
        ["Cost", run.costUsd === undefined ? undefined : `$${run.costUsd}`],
      ]
    : [];
  return (
    <section
      aria-labelledby="inspector-processing"
      className="flex flex-col gap-2"
    >
      <SectionHeading id="inspector-processing">Processing</SectionHeading>
      {status === "LoadingFirstPage" ? null : run ? (
        <FactList>
          {rows.flatMap(([label, value]) =>
            value === undefined || value === ""
              ? []
              : [
                  <Fact key={label} label={label}>
                    {value}
                  </Fact>,
                ],
          )}
        </FactList>
      ) : (
        <ProcessingStatus status={enrichmentStatus} />
      )}
      {status !== "LoadingFirstPage" && (
        <ClassifyControl itemId={itemId} run={run} />
      )}
    </section>
  );
}
