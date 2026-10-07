import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@mindspool/ui/components/input";
import { changeFilters } from "./searchParams";
import type { LibrarySearch } from "./searchParams";

/** Views that can be searched where they are; anywhere else searches the library. */
const SEARCHABLE = /^\/(library|inbox|labels\/[^/]+)\/?$/;

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
  );
}

/** Sidebar search: Enter searches the current view, `/` focuses, Esc clears. */
export function SearchBox() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { q } = useSearch({ strict: false }) as LibrarySearch;
  const [draft, setDraft] = useState(q ?? "");
  const input = useRef<HTMLInputElement>(null);

  // The URL is the source of truth: back/forward and filter clears update the box.
  useEffect(() => setDraft(q ?? ""), [q]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const searchTo = (next: string | undefined) =>
    void navigate({
      to: SEARCHABLE.test(pathname) ? "." : "/library",
      search: (prev: LibrarySearch) =>
        changeFilters(
          SEARCHABLE.test(pathname) ? prev : { layout: prev.layout },
          {
            q: next,
          },
        ),
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) searchTo(draft);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    setDraft("");
    if (q) searchTo(undefined);
  };

  return (
    <form role="search" onSubmit={submit} className="relative">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
      <Input
        ref={input}
        type="search"
        aria-label="Search everything"
        placeholder="Search everything"
        aria-keyshortcuts="/"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        className="pl-8"
      />
    </form>
  );
}
