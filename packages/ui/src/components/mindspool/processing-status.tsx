import {
  BookmarkIcon,
  CheckIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { cn } from "cn";

type ProcessingState = "saved" | "labeling" | "labeled" | "failed";

type ProcessingStatusProps = React.ComponentProps<"div"> & {
  status: ProcessingState;
  /** Retry handler; renders a "Retry" link for failed items. */
  onRetry?: () => void;
};

function ProcessingStatus({
  status,
  onRetry,
  className,
  children,
  ...props
}: ProcessingStatusProps) {
  return (
    <div
      data-slot="processing-status"
      data-status={status}
      role="status"
      className={cn(
        "flex items-center gap-2.5 text-sm [&_svg]:size-4",
        status === "labeling" && "text-primary",
        status === "failed" && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {status === "saved" && <BookmarkIcon aria-hidden="true" />}
      {status === "labeling" && (
        <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
      )}
      {status === "labeled" && (
        <CheckIcon aria-hidden="true" className="text-primary" />
      )}
      {status === "failed" && <TriangleAlertIcon aria-hidden="true" />}
      <span>{children}</span>
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
