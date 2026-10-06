import { cn } from "cn";

import { Card } from "@mindspool/ui/components/card";

type ItemCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & {
  thumb: React.ReactNode;
  title: React.ReactNode;
  source?: React.ReactNode;
  labels?: React.ReactNode;
  selected?: boolean;
};

/** Library grid card: media on top, source, title, labels. */
function ItemCard({
  thumb,
  title,
  source,
  labels,
  selected,
  className,
  ...props
}: ItemCardProps) {
  return (
    <Card
      data-slot="item-card"
      data-selected={selected || undefined}
      className={cn(
        "cursor-pointer gap-0 py-0",
        selected && "ring-2 ring-primary",
        className,
      )}
      {...props}
    >
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
        {labels && <div className="flex flex-wrap gap-1.5">{labels}</div>}
      </div>
    </Card>
  );
}

export { ItemCard, type ItemCardProps };
