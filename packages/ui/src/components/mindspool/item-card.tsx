import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

type ItemCardProps = Omit<useRender.ComponentProps<"div">, "title"> & {
  thumb: React.ReactNode;
  title: React.ReactNode;
  source?: React.ReactNode;
  status?: React.ReactNode;
  labels?: React.ReactNode;
  selected?: boolean;
};

/** Library grid card: tile on top, source, title, labels. Accepts `render`. */
function ItemCard({
  thumb,
  title,
  source,
  status,
  labels,
  selected,
  className,
  render,
  ...props
}: ItemCardProps) {
  const defaultProps = {
    "data-slot": "item-card",
    "data-selected": selected || undefined,
    "aria-current": selected ? ("true" as const) : undefined,
    className: cn(
      "flex flex-col border-2 border-border bg-card outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
      selected && "border-primary bg-primary/10",
      className,
    ),
    children: (
      <>
        {thumb}
        <div className="flex flex-col gap-2 p-3">
          {source && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground [&_svg]:size-3.5">
              {source}
            </div>
          )}
          <div className="font-heading text-[15px] leading-tight font-extrabold">
            {title}
          </div>
          {status}
          {labels && <div className="flex flex-wrap gap-1.5">{labels}</div>}
        </div>
      </>
    ),
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export { ItemCard, type ItemCardProps };
