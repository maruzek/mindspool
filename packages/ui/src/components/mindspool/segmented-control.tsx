import { cn } from "cn";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@mindspool/ui/components/toggle-group";

type SegmentedOption = {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
};

/** Single-select segmented control (List/Grid, Labels/Source, …). */
function SegmentedControl({
  options,
  value,
  onValueChange,
  className,
  ...props
}: SegmentedControlProps) {
  return (
    <ToggleGroup
      data-slot="segmented-control"
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        // a segmented control always has a selection; ignore deselect
        const [first] = next;
        if (first !== undefined) onValueChange(first);
      }}
      className={cn("overflow-hidden border border-border", className)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-auto gap-1.5 rounded-none px-3 py-[7px] text-[13px] font-normal not-first:border-l not-first:border-border data-pressed:bg-primary data-pressed:text-primary-foreground"
        >
          {option.icon}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { SegmentedControl, type SegmentedControlProps, type SegmentedOption };
