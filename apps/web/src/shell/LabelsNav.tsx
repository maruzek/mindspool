import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Hash, Plus } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@mindspool/ui/components/sidebar";
import { CreateLabelDialog } from "./CreateLabelDialog";
import { isActivePath } from "./nav";

const PAGE = 20;

/** The owner's labels as sidebar destinations, loaded a page at a time. */
export function LabelsNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { results, status, loadMore } = usePaginatedQuery(
    api.labels.list,
    {},
    { initialNumItems: PAGE },
  );
  const [creating, setCreating] = useState(false);
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Labels</SidebarGroupLabel>
      <SidebarGroupAction
        aria-label="Create label"
        title="Create label"
        onClick={() => setCreating(true)}
      >
        <Plus />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <nav aria-label="Labels">
          {status === "LoadingFirstPage" ? (
            <div role="status" aria-label="Loading labels">
              {[0, 1, 2].map((i) => (
                <SidebarMenuSkeleton key={i} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">No labels yet.</p>
          ) : (
            <SidebarMenu>
              {results.map((label) => {
                const active = isActivePath(pathname, `/labels/${label._id}`);
                return (
                  <SidebarMenuItem key={label._id}>
                    <SidebarMenuButton
                      isActive={active}
                      render={
                        <Link
                          to="/labels/$labelId"
                          params={{ labelId: label._id }}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                    >
                      <Hash className="opacity-60" />
                      <span>{label.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
          {status === "CanLoadMore" && (
            <SidebarMenuButton onClick={() => loadMore(PAGE)}>
              More labels
            </SidebarMenuButton>
          )}
          {status === "LoadingMore" && (
            <p role="status" className="px-2 text-sm text-muted-foreground">
              Loading more labels…
            </p>
          )}
        </nav>
      </SidebarGroupContent>
      <CreateLabelDialog open={creating} onOpenChange={setCreating} />
    </SidebarGroup>
  );
}
