import { IconTile } from "@mindspool/ui/components/reui/icon-tile";
import { cn } from "cn";

type ItemThumbProps = React.ComponentProps<typeof IconTile>;

/** Square media placeholder: the kind glyph on a muted ink tint. */
function ItemThumb({ className, ...props }: ItemThumbProps) {
  return (
    <IconTile
      data-slot="item-thumb"
      aria-hidden="true"
      className={cn(
        "border-0 bg-foreground/8 text-foreground/55 [--icon-tile-radius:0px]",
        className,
      )}
      {...props}
    />
  );
}

export { ItemThumb, type ItemThumbProps };
