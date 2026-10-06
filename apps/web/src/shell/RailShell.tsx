import { Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@mindspool/ui/components/tooltip";
import { IconRail } from "./IconRail";
import { SkipLink } from "./SkipLink";

/** Frame for full-bleed canvases: a 60px rail and an unpadded content area. */
export function RailShell() {
  return (
    <TooltipProvider>
      <div className="flex min-h-svh">
        <SkipLink />
        <IconRail />
        <main
          id="main"
          tabIndex={-1}
          className="relative min-w-0 flex-1 bg-background outline-none"
        >
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
