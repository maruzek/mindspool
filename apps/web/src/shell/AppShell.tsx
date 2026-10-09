import type { CSSProperties } from "react";
import { RailShell } from "./RailShell";
import { Outlet, useRouterState } from "@tanstack/react-router";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@mindspool/ui/components/sidebar";
import { TooltipProvider } from "@mindspool/ui/components/tooltip";
import { AppSidebar } from "./AppSidebar";
import { BrandMark } from "./BrandMark";
import { SkipLink } from "./SkipLink";

/** The 240px sidebar frame used by Inbox, Library and label pages. */
export function AppShell() {
  const isBoard = useRouterState({
    select: (s) =>
      s.matches.some(
        (m) =>
          m.routeId === "/_app/labels/$labelId" && m.search.layout === "board",
      ),
  });
  if (isBoard) return <RailShell />;
  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <SkipLink />
        <AppSidebar />
        <SidebarInset id="main" tabIndex={-1} className="outline-none">
          {/* Below 768px the sidebar is a sheet opened from this bar. */}
          <header className="flex h-12 items-center gap-2 border-b-2 px-3 md:hidden">
            <SidebarTrigger aria-label="Open menu" />
            <BrandMark />
            <span className="font-heading font-extrabold tracking-tight">
              mindspool
            </span>
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
