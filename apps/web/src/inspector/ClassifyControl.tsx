import { useState } from "react";
import { useMutation } from "convex/react";
import { SparklesIcon } from "lucide-react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { MAX_LABEL_QUESTIONS } from "@mindspool/schema";
import { Button } from "@mindspool/ui/components/button";
import { SegmentedControl } from "@mindspool/ui/components/mindspool/segmented-control";
import { errorMessage } from "../errors";
import type { ProcessingRun } from "./types";

type Model = "clef-flash" | "clef";

/** Runs the label model on one item; disabled while a decision run is pending. */
export function ClassifyControl({
  itemId,
  run,
}: {
  itemId: Id<"items">;
  run: ProcessingRun | undefined;
}) {
  const classify = useMutation(api.decisions.classify);
  const [model, setModel] = useState<Model>("clef-flash");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = run?.kind === "decision" && run.status === "pending";
  const total = run?.labelsTotal;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await classify({ itemId, model });
    } catch (caught) {
      setError(errorMessage(caught, "Could not start labeling. Try again."));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Model"
          value={model}
          onValueChange={(next) =>
            setModel(next === "clef" ? "clef" : "clef-flash")
          }
          options={[
            { value: "clef-flash", label: "Clef-flash" },
            { value: "clef", label: "Clef" },
          ]}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={starting || running}
          onClick={() => void start()}
        >
          <SparklesIcon aria-hidden="true" />
          {running ? "Classifying…" : "Classify"}
        </Button>
      </div>
      {total !== undefined && total > MAX_LABEL_QUESTIONS && (
        <p className="text-xs text-muted-foreground">
          Asked about {run?.labelsAsked ?? MAX_LABEL_QUESTIONS} of {total}{" "}
          labels (most recent)
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
