import { useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { LogOut, Settings, Sparkles, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@mindspool/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mindspool/ui/components/dropdown-menu";
import { SidebarMenuButton } from "@mindspool/ui/components/sidebar";
import { errorMessage } from "../errors";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Account footer. Development examples are offered only where the backend allows them. */
export function UserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const availability = useQuery(api.seed.availability);
  const loadExamples = useMutation(api.seed.load);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const name = user?.firstName ?? user?.username ?? "Account";

  async function load() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await loadExamples({});
      setMessage(
        result.createdItems
          ? `Added ${result.createdItems} examples.`
          : "Examples are already in your library.",
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not load examples. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {pending && (
        <p role="status" className="px-2 text-xs">
          Loading examples…
        </p>
      )}
      {message && (
        <p role="status" className="px-2 text-xs">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="px-2 text-xs">
          {error}
        </p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuButton size="lg" aria-label="Account menu" />}
        >
          <Avatar size="sm" className="rounded-none">
            <AvatarFallback className="rounded-none bg-accent text-accent-foreground">
              {initials(user?.fullName ?? name)}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate">{name}</span>
          <Settings />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-48">
          <DropdownMenuItem onClick={() => openUserProfile()}>
            <UserRound /> Manage account
          </DropdownMenuItem>
          {availability?.enabled && (
            <DropdownMenuItem disabled={pending} onClick={load}>
              <Sparkles /> Load examples
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
