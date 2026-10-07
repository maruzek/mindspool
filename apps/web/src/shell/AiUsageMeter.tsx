import { Component, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Progress } from "@mindspool/ui/components/progress";
import { Skeleton } from "@mindspool/ui/components/skeleton";
import { cn } from "@mindspool/ui/lib/utils";

const WARN_FROM = 0.8;

/** "5h 12m", or "12m" under an hour. */
export function untilReset(resetsAt: number, now: number) {
  const minutes = Math.max(0, Math.ceil((resetsAt - now) / 60000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const Unavailable = () => (
  <p className="text-xs text-sidebar-foreground/60">AI usage unavailable</p>
);

/** A failed subscription throws; the meter must say so rather than disappear. */
class MeterBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Unavailable /> : this.props.children;
  }
}

function Meter() {
  const now = useNow();
  // The server never reads the clock, so the day comes from here and rolls at midnight.
  const usage = useQuery(api.aiUsage.today, {
    day: new Date(now).toISOString().slice(0, 10),
  });
  if (usage === undefined)
    return <Skeleton data-testid="ai-usage-loading" className="h-4 w-full" />;
  if (usage === null) return <Unavailable />;
  const reached = usage.fraction >= 1;
  const warn = usage.fraction >= WARN_FROM;
  const percent = Math.min(100, Math.round(usage.fraction * 100));
  const reset = untilReset(usage.resetsAt, now);
  const nf = new Intl.NumberFormat("en-US");
  const tone = reached ? "destructive" : warn ? "warning" : "success";
  return (
    <div
      title={`${nf.format(Math.round(usage.used))} of ${nf.format(usage.limit)} neurons · ${nf.format(usage.runs)} runs · resets in ${reset}`}
      className="flex flex-col gap-1.5"
    >
      <Progress
        value={percent}
        aria-label="AI usage today"
        className={cn(
          "gap-1.5 text-xs",
          "[&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:rounded-none",
          "[&_[data-slot=progress-indicator]]:rounded-none",
          tone === "success" && "[&_[data-slot=progress-indicator]]:bg-success",
          tone === "warning" && "[&_[data-slot=progress-indicator]]:bg-warning",
          tone === "destructive" &&
            "[&_[data-slot=progress-indicator]]:bg-destructive",
        )}
      >
        <div className="flex w-full items-baseline justify-between">
          <span className="text-sidebar-foreground/70">AI today</span>
          <span
            className={cn(
              "tabular-nums",
              reached ? "text-destructive" : "text-sidebar-foreground/70",
            )}
          >
            {reached ? `Limit reached · resets in ${reset}` : `${percent}%`}
          </span>
        </div>
      </Progress>
    </div>
  );
}

/** Today's AI budget, always visible above the user menu. */
export function AiUsageMeter() {
  return (
    <div className="px-4 pb-2 pt-3" data-slot="ai-usage-meter">
      <MeterBoundary>
        <Meter />
      </MeterBoundary>
    </div>
  );
}
