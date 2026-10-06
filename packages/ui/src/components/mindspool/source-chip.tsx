import { Toggle } from "@mindspool/ui/components/toggle";
import { cn } from "cn";

type SourceChipProps = React.ComponentProps<typeof Toggle>;

/** Filter chip (X, Instagram, Web, Needs review…). Pressed = active filter. */
function SourceChip({ className, ...props }: SourceChipProps) {
  return (
    <Toggle
      data-slot="source-chip"
      variant="outline"
      className={cn(
        "h-auto gap-1.5 border-2 border-border px-[11px] py-[5px] font-normal data-pressed:bg-primary/14 data-pressed:text-ms-accent-700",
        className,
      )}
      {...props}
    />
  );
}

export { SourceChip, type SourceChipProps };
