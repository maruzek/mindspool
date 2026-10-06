import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@mindspool/ui/components/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@mindspool/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@mindspool/ui/components/tooltip";
import { BrandMark } from "./BrandMark";
import { LabelsNav } from "./LabelsNav";
import { isActivePath, mainNav } from "./nav";
import { UserMenu } from "./UserMenu";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();
  // Picking a destination closes the mobile sheet.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  return (
    <Sidebar className="border-sidebar-border group-data-[side=left]:border-r-2">
      <aside
        aria-label="Sidebar"
        className="dark-sidebar flex h-full flex-col bg-sidebar"
      >
        <SidebarHeader className="gap-5 p-4">
          <Link to="/library" className="flex items-center gap-2 px-1.5">
            <BrandMark />
            <span className="font-heading text-lg font-extrabold tracking-tight">
              mindspool
            </span>
          </Link>
          <Tooltip>
            <TooltipTrigger render={<div className="relative" />}>
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                disabled
                aria-label="Search everything"
                placeholder="Search everything"
                className="pl-8"
              />
            </TooltipTrigger>
            <TooltipContent side="right">Search is coming soon</TooltipContent>
          </Tooltip>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <nav aria-label="Primary">
              <SidebarMenu>
                {mainNav.map(({ to, label, icon: Icon }) => {
                  const active = isActivePath(pathname, to);
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        isActive={active}
                        render={
                          <Link
                            to={to}
                            aria-current={active ? "page" : undefined}
                          />
                        }
                      >
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroup>
          <LabelsNav />
        </SidebarContent>
        <SidebarFooter className="p-3">
          <UserMenu />
        </SidebarFooter>
      </aside>
    </Sidebar>
  );
}
