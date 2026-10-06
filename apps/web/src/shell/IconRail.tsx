import { Link, useRouterState } from "@tanstack/react-router";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@mindspool/ui/components/tooltip";
import { cn } from "@mindspool/ui/lib/utils";
import { BrandMark } from "./BrandMark";
import { isActivePath, mainNav } from "./nav";

/** The 60px icon rail used by the Board and Graph canvases. */
export function IconRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="dark-sidebar flex w-15 shrink-0 flex-col items-center gap-1.5 border-r-2 border-sidebar-border bg-sidebar py-4 text-sidebar-foreground">
      <Link to="/library" aria-label="Mindspool" className="mb-3.5">
        <BrandMark className="size-5.5" />
      </Link>
      <nav aria-label="Primary" className="flex flex-col items-center gap-1.5">
        {mainNav.map(({ to, label, icon: Icon }) => {
          const active = isActivePath(pathname, to);
          return (
            <Tooltip key={to}>
              <TooltipTrigger
                render={
                  <Link
                    to={to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "grid size-9.5 place-items-center outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-5",
                      active &&
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  />
                }
              >
                <Icon />
                <span className="sr-only">{label}</span>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
