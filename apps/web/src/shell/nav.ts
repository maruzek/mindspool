import { Inbox, LayoutGrid, List, Waypoints, Plug } from "lucide-react";

export const mainNav = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/library", label: "Library", icon: List },
  { to: "/boards", label: "Boards", icon: LayoutGrid },
  { to: "/graph", label: "Graph", icon: Waypoints },
  { to: "/settings/integrations", label: "Integrations", icon: Plug },
] as const;

/** A destination is active on its own path and anything beneath it. */
export function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}
