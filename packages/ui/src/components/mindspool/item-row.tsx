import { cn } from "cn";

type ItemRowProps = Omit<React.ComponentProps<"div">, "title"> & {
  thumb: React.ReactNode;
  title: React.ReactNode;
  /** Source line: icon + host, pending marker… */
  source?: React.ReactNode;
  /** <LabelTag />s */
  labels?: React.ReactNode;
  date?: React.ReactNode;
  selected?: boolean;
};

/** Library list row: thumb · title/source · labels · date. */
function ItemRow({
  thumb,
  title,
  source,
  labels,
  date,
  selected,
  className,
  ...props
}: ItemRowProps) {
  return (
    <div
      data-slot="item-row"
      data-selected={selected || undefined}
      className={cn(
        "grid cursor-pointer grid-cols-[72px_minmax(0,1fr)_auto_64px] items-center gap-4 px-3 py-2.5 hover:bg-foreground/5",
        selected && "bg-primary/10 ring-2 ring-primary ring-inset",
        className,
      )}
      {...props}
    >
      {thumb}
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {source && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
            {source}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">{labels}</div>
      <div className="text-right text-xs text-muted-foreground">{date}</div>
    </div>
  );
}

export { ItemRow, type ItemRowProps };
