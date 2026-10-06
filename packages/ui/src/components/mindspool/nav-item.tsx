import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

type NavItemProps = useRender.ComponentProps<"a"> & {
  icon?: React.ReactNode;
  /** Trailing count or hint. */
  meta?: React.ReactNode;
  active?: boolean;
};

/** Sidebar / rail row. Renders an <a>; use `render` to swap in a router link. */
function NavItem({
  icon,
  meta,
  active,
  className,
  children,
  render,
  ...props
}: NavItemProps) {
  return useRender({
    defaultTagName: "a",
    render,
    props: {
      "data-slot": "nav-item",
      "aria-current": active ? "page" : undefined,
      className: cn(
        "flex items-center gap-2.5 px-2 py-[7px] text-sm text-foreground [&_svg]:size-[17px]",
        "hover:bg-foreground/7",
        active && "bg-primary/14 text-ms-accent-700 hover:bg-primary/14",
        className,
      ),
      children: (
        <>
          {icon}
          <span className="flex-1">{children}</span>
          {meta !== undefined && (
            <span className="text-xs text-muted-foreground">{meta}</span>
          )}
        </>
      ),
      ...props,
    },
  });
}

export { NavItem, type NavItemProps };
