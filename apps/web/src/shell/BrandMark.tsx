import { cn } from "@mindspool/ui/lib/utils";

/** The two-square Mindspool mark: accent block with two ground-colored corners. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative block size-5 shrink-0 bg-primary", className)}
    >
      <span className="absolute right-0 bottom-0 size-[48%] bg-background" />
      <span className="absolute top-0 left-0 size-[48%] bg-background" />
    </span>
  );
}
