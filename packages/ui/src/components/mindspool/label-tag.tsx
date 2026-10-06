import { SparklesIcon } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@mindspool/ui/components/reui/badge";

/**
 * confirmed — by you or accepted (solid)
 * suggested — model suggestion, dashed outline with optional confidence
 * manual    — manual, system-wide label (neutral)
 * rejected  — struck through, dashed hairline
 */
type LabelTagState = "confirmed" | "suggested" | "manual" | "rejected";

type LabelTagProps = Omit<React.ComponentProps<typeof Badge>, "variant"> & {
  state?: LabelTagState;
  /** 0–100; shown after the name for suggested labels. */
  confidence?: number;
};

const stateClass: Record<LabelTagState, string> = {
  confirmed: "border-primary",
  suggested:
    "gap-1 border-2 border-dashed border-primary bg-transparent text-ms-accent-700 dark:bg-transparent",
  manual: "border-transparent bg-ms-neutral-100 text-ms-neutral-800",
  rejected:
    "border-dashed border-border bg-transparent text-foreground/45 line-through",
};

function LabelTag({
  state = "confirmed",
  confidence,
  className,
  children,
  ...props
}: LabelTagProps) {
  return (
    <Badge
      data-slot="label-tag"
      data-state={state}
      variant={state === "confirmed" ? "default" : "outline"}
      className={cn(
        "h-auto px-2.5 py-0.5 text-[11px] tracking-[0.02em]",
        stateClass[state],
        className,
      )}
      {...props}
    >
      {state === "suggested" && <SparklesIcon aria-hidden="true" />}
      {children}
      {state === "suggested" && confidence !== undefined && (
        <span aria-label={`confidence ${confidence}`}> · {confidence}</span>
      )}
    </Badge>
  );
}

export { LabelTag, type LabelTagProps, type LabelTagState };
