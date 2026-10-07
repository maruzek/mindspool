import { useNavigate, useSearch } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { SourceChip } from "@mindspool/ui/components/mindspool/source-chip";
import { ToggleGroup } from "@mindspool/ui/components/toggle-group";
import { SourceIcon } from "../library/BrandIcon";
import { SOURCES, SOURCE_LABELS, changeFilters } from "./searchParams";
import type { LibrarySearch, Source } from "./searchParams";

const ALL = "all";

/** Source chips (one at a time) and the Needs review toggle; state lives in the URL. */
export function FilterBar() {
  const navigate = useNavigate();
  const { source, review } = useSearch({ strict: false }) as LibrarySearch;
  const change = (patch: Parameters<typeof changeFilters>[1]) =>
    void navigate({
      to: ".",
      search: (prev: LibrarySearch) => changeFilters(prev, patch),
      replace: true,
      resetScroll: false,
    });
  return (
    <div
      role="group"
      aria-label="Filters"
      className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
    >
      <ToggleGroup
        aria-label="Source"
        spacing={2}
        value={[source ?? ALL]}
        onValueChange={([next]) => {
          // One source is always selected; clicking the active chip is a no-op.
          if (next === undefined) return;
          change({ source: next === ALL ? undefined : (next as Source) });
        }}
        className="shrink-0"
      >
        <SourceChip value={ALL}>All sources</SourceChip>
        {SOURCES.map((kind) => (
          <SourceChip key={kind} value={kind}>
            <SourceIcon source={kind} />
            {SOURCE_LABELS[kind]}
          </SourceChip>
        ))}
      </ToggleGroup>
      <span aria-hidden="true" className="h-5 w-0.5 shrink-0 bg-border" />
      <SourceChip
        pressed={review === 1}
        onPressedChange={(on) => change({ review: on ? 1 : undefined })}
        className="shrink-0 text-primary"
      >
        <SparklesIcon />
        Needs review
      </SourceChip>
    </div>
  );
}
