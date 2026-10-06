import { cn } from "cn";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@mindspool/ui/components/input-group";

type IconInputProps = React.ComponentProps<"input"> & {
  /** Leading icon (search, link…). */
  icon: React.ReactNode;
  groupClassName?: string;
};

/** Text input with a leading icon, on the surface fill. */
function IconInput({
  icon,
  groupClassName,
  className,
  ...props
}: IconInputProps) {
  return (
    <InputGroup
      className={cn("h-9 bg-card", groupClassName)}
      data-slot="icon-input"
    >
      <InputGroupAddon>{icon}</InputGroupAddon>
      <InputGroupInput className={className} {...props} />
    </InputGroup>
  );
}

export { IconInput, type IconInputProps };
