import {
  BookmarkIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { cn } from "cn";

/** Mirrors an Item's `enrichmentStatus`. */
type ProcessingState = "not_started" | "pending" | "succeeded" | "failed";

type ProcessingStatusProps = React.ComponentProps<"div"> & {
  status: ProcessingState;
  /** Renders a "Retry" button for failed items; unused until reprocessing exists. */
  onRetry?: () => void;
};

const copy: Record<Exclude<ProcessingState, "succeeded">, string> = {
  not_started: "Saved — original stored",
  pending: "Processing…",
  failed: "Extraction failed — link kept",
};

/** One quiet line under a row or card; nothing once processing has succeeded. */
function ProcessingStatus({
  status,
  onRetry,
  className,
  children,
  ...props
}: ProcessingStatusProps) {
  if (status === "succeeded") return null;
  return (
    <div
      data-slot="processing-status"
      data-status={status}
      className={cn(
        "flex items-center gap-1.5 text-xs [&_svg]:size-3.5",
        status === "pending" ? "text-primary" : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {status === "not_started" && <BookmarkIcon aria-hidden="true" />}
      {status === "pending" && (
        <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
      )}
      {status === "failed" && <TriangleAlertIcon aria-hidden="true" />}
      <span>{children ?? copy[status]}</span>
      {status === "failed" && onRetry && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onRetry}
            className="text-primary underline underline-offset-3"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}

export { ProcessingStatus, type ProcessingState, type ProcessingStatusProps };
