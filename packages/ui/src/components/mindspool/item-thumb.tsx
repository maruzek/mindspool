import { LinkIcon, StickyNoteIcon } from "lucide-react";
import { cn } from "cn";

type ItemThumbProps = React.ComponentProps<"span"> & {
  kind: "link" | "note";
};

/**
 * Media placeholder: a hatched tonal tile with the kind glyph. No image is
 * fetched; pass `children` to replace the glyph (for example a brand mark).
 */
function ItemThumb({ kind, className, children, ...props }: ItemThumbProps) {
  return (
    <span
      data-slot="item-thumb"
      data-kind={kind}
      aria-hidden="true"
      className={cn(
        "flex h-14 w-[72px] shrink-0 items-center justify-center bg-foreground/8 text-foreground/55 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklab,currentColor_14%,transparent)_6px_7px)] [&_svg]:size-5",
        className,
      )}
      {...props}
    >
      {children ?? (kind === "link" ? <LinkIcon /> : <StickyNoteIcon />)}
    </span>
  );
}

export { ItemThumb, type ItemThumbProps };
