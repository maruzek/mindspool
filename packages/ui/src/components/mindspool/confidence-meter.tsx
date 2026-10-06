import { Progress } from "@mindspool/ui/components/progress";
import { cn } from "cn";

type ConfidenceMeterProps = {
  /** 0–100 */
  value: number;
  className?: string;
};

/** Thin bar + numeric score used on suggested labels. */
function ConfidenceMeter({ value, className }: ConfidenceMeterProps) {
  return (
    <div
      data-slot="confidence-meter"
      className={cn("flex flex-1 items-center gap-2.5", className)}
    >
      <Progress
        value={value}
        aria-label="Confidence"
        className="flex-1 [&_[data-slot=progress-track]]:h-[3px] [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-foreground/10"
      />
      <span className="w-7 text-right text-xs text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

export { ConfidenceMeter, type ConfidenceMeterProps };
