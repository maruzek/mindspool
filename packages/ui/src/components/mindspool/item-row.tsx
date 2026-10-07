import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

type ItemRowProps = Omit<useRender.ComponentProps<"div">, "title"> & {
  thumb: React.ReactNode;
  title: React.ReactNode;
  /** Source line: icon + host + capture source. */
  source?: React.ReactNode;
  /** Processing line under the source (see ProcessingStatus). */
  status?: React.ReactNode;
  /** Confirmed `<LabelTag />`s; hidden below 768px. */
  labels?: React.ReactNode;
  date?: React.ReactNode;
  selected?: boolean;
};

/**
 * Library list row: thumb · title/source · labels · date. Pass `render` (for
 * example a router `<Link />`) to make the whole row the interactive element.
 */
function ItemRow({
  thumb,
  title,
  source,
  status,
  labels,
  date,
  selected,
  className,
  render,
  ...props
}: ItemRowProps) {
  const defaultProps = {
    "data-slot": "item-row",
    "data-selected": selected || undefined,
    "aria-current": selected ? ("true" as const) : undefined,
    className: cn(
      "relative grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-4 border-b-2 border-border px-3 py-2.5 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid-cols-[72px_minmax(0,1fr)_auto_64px]",
      selected &&
        "bg-primary/10 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary",
      className,
    ),
    children: (
      <>
        {thumb}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{title}</div>
          {source && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
              {source}
            </div>
          )}
          {status}
        </div>
        <div className="hidden flex-wrap justify-end gap-1.5 md:flex">
          {labels}
        </div>
        <div className="text-right text-xs text-muted-foreground">{date}</div>
      </>
    ),
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export { ItemRow, type ItemRowProps };
