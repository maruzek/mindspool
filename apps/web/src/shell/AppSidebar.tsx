import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@mindspool/ui/components/sidebar";
import { SearchBox } from "../search/SearchBox";
import { BrandMark } from "./BrandMark";
import { LabelsNav } from "./LabelsNav";
import { isActivePath, mainNav } from "./nav";
import { UserMenu } from "./UserMenu";

const INBOX_COUNT_ID = "inbox-count";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();
  const stats = useQuery(api.items.stats, {});
  const inboxCount = stats?.inbox ?? 0;
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
          <SearchBox />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <nav aria-label="Primary">
              <SidebarMenu>
                {mainNav.map(({ to, label, icon: Icon }) => {
                  const active = isActivePath(pathname, to);
                  const count = to === "/inbox" ? inboxCount : 0;
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        isActive={active}
                        render={
                          <Link
                            to={to}
                            aria-current={active ? "page" : undefined}
                            aria-describedby={
                              count > 0 ? INBOX_COUNT_ID : undefined
                            }
                          />
                        }
                      >
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge id={INBOX_COUNT_ID}>
                          {count > 99 ? "99+" : count}
                        </SidebarMenuBadge>
                      )}
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
