import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  LocateFixed,
} from "lucide-react";
import { Button } from "@mindspool/ui/components/button";
import { Checkbox } from "@mindspool/ui/components/checkbox";
import { Card, CardContent, CardFooter } from "@mindspool/ui/components/card";
import { Badge } from "@mindspool/ui/components/reui/badge";
import { IconInput } from "@mindspool/ui/components/mindspool/search-input";
import { SourceIcon } from "../library/BrandIcon";
import type { LabelSearch } from "../search/searchParams";
import { SOURCES, SOURCE_LABELS } from "../search/searchParams";
import type { BoardPreview } from "./types";
import { BoardChoice } from "./BoardChoice";
import { TrayResizeHandle } from "./TrayResizeHandle";
import { useTraySearch } from "./useTraySearch";
import { CardSource, SourceLink } from "./CardSource";
export const ITEM_DRAG = "application/x-mindspool-item";
export function LibraryTray({
  items,
  status,
  filters,
  onFilters,
  placed,
  onAdd,
  onLocate,
  loadMore,
  boardKey,
  labels,
  disabled,
}: {
  items: BoardPreview[];
  status: string;
  filters: LabelSearch;
  onFilters: (patch: Partial<LabelSearch>) => void;
  placed: Set<string>;
  onAdd: (itemId: BoardPreview["itemId"]) => void;
  onLocate: (itemId: string) => void;
  loadMore: () => void;
  boardKey: string;
  labels: { _id: string; name: string }[];
  disabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(`board-tray-${boardKey}`) === "closed",
  );
  const [height, setHeight] = useState(() =>
    Math.max(
      160,
      Math.min(
        440,
        Number(localStorage.getItem(`board-tray-height-${boardKey}`)) || 260,
      ),
    ),
  );
  const search = useTraySearch(filters.q, onFilters);
  const more = status === "CanLoadMore" || status === "LoadingMore";
  const ordered = [
    ...items.filter((item) => !placed.has(item.itemId)),
    ...items.filter((item) => placed.has(item.itemId)),
  ];
  return (
    <section
      aria-label="Board library tray"
      className="relative z-10 mx-5 mb-5 flex shrink-0 flex-col border border-border bg-card shadow-md"
      style={{ height: collapsed ? undefined : height, maxHeight: "45vh" }}
    >
      {!collapsed && (
        <TrayResizeHandle
          height={height}
          onHeight={(value) => {
            const next = Math.max(160, Math.min(440, value));
            setHeight(next);
            localStorage.setItem(`board-tray-height-${boardKey}`, String(next));
          }}
        />
      )}
      <header className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-3 pt-2">
        <h2 className="mr-1 text-sm">Library</h2>
        <BoardChoice
          label="Tray scope"
          value={filters.trayScope ?? "label"}
          options={[
            { value: "label", label: "Current label" },
            { value: "all", label: "All library" },
          ]}
          onChange={(trayScope) => onFilters({ trayScope })}
        />
        {!collapsed && (
          <>
            <IconInput
              icon={<Search />}
              type="search"
              aria-label="Search tray"
              placeholder="Search saved items"
              groupClassName="h-8 w-52"
              value={search.draft}
              onChange={(event) => search.change(event.target.value)}
            />
            {filters.trayScope === "all" && (
              <BoardChoice
                label="Tray label"
                value={filters.trayLabel ?? ""}
                options={[
                  { value: "", label: "All labels" },
                  ...labels.map((label) => ({
                    value: label._id,
                    label: label.name,
                  })),
                ]}
                onChange={(trayLabel) =>
                  onFilters({ trayLabel: trayLabel || undefined })
                }
              />
            )}
            <BoardChoice
              label="Tray source"
              value={filters.source ?? ""}
              options={[
                { value: "", label: "All sources" },
                ...SOURCES.map((source) => ({
                  value: source,
                  label: SOURCE_LABELS[source],
                  icon: <SourceIcon source={source} />,
                })),
              ]}
              onChange={(source) => onFilters({ source: source || undefined })}
            />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                aria-label="Needs review"
                checked={Boolean(filters.review)}
                onCheckedChange={(checked) =>
                  onFilters({ review: checked ? 1 : undefined })
                }
              />
              Needs review
            </label>
            <BoardChoice
              label="Tray sort"
              disabled={Boolean(filters.q)}
              value={filters.q ? "match" : (filters.traySort ?? "newest")}
              options={
                filters.q
                  ? [{ value: "match", label: "Best match" }]
                  : [
                      { value: "newest", label: "Newest" },
                      { value: "oldest", label: "Oldest" },
                    ]
              }
              onChange={(traySort) => {
                if (traySort !== "match") onFilters({ traySort });
              }}
            />
            {(search.draft ||
              filters.q ||
              filters.source ||
              filters.review ||
              filters.trayLabel) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  search.reset();
                  onFilters({
                    q: undefined,
                    source: undefined,
                    review: undefined,
                    trayLabel: undefined,
                  });
                }}
              >
                Reset filters
              </Button>
            )}
          </>
        )}
        <Button
          className="ml-auto"
          variant="ghost"
          size="sm"
          onClick={() => {
            setCollapsed(!collapsed);
            localStorage.setItem(
              `board-tray-${boardKey}`,
              !collapsed ? "closed" : "open",
            );
          }}
        >
          {collapsed ? <ChevronUp /> : <ChevronDown />}
          {collapsed ? "Open tray" : "Collapse tray"}
        </Button>
      </header>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          {status === "LoadingFirstPage" ? (
            <p role="status">Loading library…</p>
          ) : !items.length ? (
            <p>
              {more
                ? "More saved items may match. Load another page."
                : filters.q ||
                    filters.source ||
                    filters.review ||
                    filters.trayLabel
                  ? "No results"
                  : "No saved items in this scope yet."}
            </p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {ordered.map((item) => (
                <li
                  key={item.itemId}
                  draggable={!disabled && !placed.has(item.itemId)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(ITEM_DRAG, item.itemId);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <Card size="sm" className="h-full gap-2 border bg-background">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-20 w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <CardContent className="flex flex-1 flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <CardSource source={item.source} />
                        <SourceLink url={item.originalUrl} />
                      </div>
                      <h3 className="line-clamp-2 text-sm">{item.title}</h3>
                      {placed.has(item.itemId) && (
                        <Badge variant="secondary" size="sm">
                          On this board
                        </Badge>
                      )}
                    </CardContent>
                    <CardFooter className="border-0 bg-transparent pt-0">
                      {placed.has(item.itemId) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onLocate(item.itemId)}
                        >
                          <LocateFixed />
                          Locate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => onAdd(item.itemId)}
                        >
                          <Plus />
                          Add to board
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {more && (
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={status === "LoadingMore"}
              onClick={loadMore}
            >
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
