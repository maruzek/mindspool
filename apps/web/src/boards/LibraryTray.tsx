import { useState } from "react";
import { Button } from "@mindspool/ui/components/button";
import { Input } from "@mindspool/ui/components/input";
import type { LabelSearch } from "../search/searchParams";
import { SOURCES, SOURCE_LABELS } from "../search/searchParams";
import type { BoardPreview } from "./types";
export const ITEM_DRAG = "application/x-mindspool-item";
const selectStyle = "border border-border bg-background px-2 py-1 text-sm";
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
  const more = status === "CanLoadMore" || status === "LoadingMore";
  return (
    <section
      aria-label="Board library tray"
      className="relative z-10 mx-5 mb-5 border border-border bg-card p-3 shadow-md"
      style={{ height: collapsed ? undefined : height, maxHeight: "45vh" }}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm">Library</h2>
        <select
          aria-label="Tray scope"
          className={selectStyle}
          value={filters.trayScope ?? "label"}
          onChange={(e) =>
            onFilters({ trayScope: e.target.value as "label" | "all" })
          }
        >
          <option value="label">Current label</option>
          <option value="all">All library</option>
        </select>
        <Button
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
          {collapsed ? "Open tray" : "Collapse tray"}
        </Button>
        {!collapsed && (
          <>
            <Input
              aria-label="Search tray"
              placeholder="Search saved items"
              className="w-48"
              value={filters.q ?? ""}
              onChange={(e) => onFilters({ q: e.target.value })}
            />
            {filters.trayScope === "all" && (
              <select
                className={selectStyle}
                aria-label="Tray label"
                value={filters.trayLabel ?? ""}
                onChange={(e) =>
                  onFilters({ trayLabel: e.target.value || undefined })
                }
              >
                <option value="">All labels</option>
                {labels.map((label) => (
                  <option key={label._id} value={label._id}>
                    {label.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className={selectStyle}
              aria-label="Tray source"
              value={filters.source ?? ""}
              onChange={(e) =>
                onFilters({ source: e.target.value as LabelSearch["source"] })
              }
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={Boolean(filters.review)}
                onChange={(e) =>
                  onFilters({ review: e.target.checked ? 1 : undefined })
                }
              />
              Needs review
            </label>
            <select
              className={selectStyle}
              aria-label="Tray sort"
              disabled={Boolean(filters.q)}
              value={filters.q ? "match" : (filters.traySort ?? "newest")}
              onChange={(e) =>
                onFilters({ traySort: e.target.value as "newest" | "oldest" })
              }
            >
              {filters.q ? (
                <option value="match">Best match</option>
              ) : (
                <>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </>
              )}
            </select>
            {(filters.q ||
              filters.source ||
              filters.review ||
              filters.trayLabel) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onFilters({
                    q: undefined,
                    source: undefined,
                    review: undefined,
                    trayLabel: undefined,
                  })
                }
              >
                Reset filters
              </Button>
            )}
            <label className="ml-auto text-xs">
              Tray height
              <input
                className="ml-1 w-16"
                aria-label="Tray height"
                type="range"
                min={160}
                max={440}
                value={height}
                onChange={(e) => {
                  setHeight(Number(e.target.value));
                  localStorage.setItem(
                    `board-tray-height-${boardKey}`,
                    e.target.value,
                  );
                }}
              />
            </label>
          </>
        )}
      </header>
      {!collapsed && (
        <div className="mt-3 h-[calc(100%-3rem)] overflow-auto">
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
              {items.map((item) => (
                <li
                  key={item.itemId}
                  className="border border-border bg-background p-3"
                  draggable={!disabled && !placed.has(item.itemId)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ITEM_DRAG, item.itemId);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-16 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.source}
                  </p>
                  <h3 className="line-clamp-2 text-sm">{item.title}</h3>
                  {placed.has(item.itemId) ? (
                    <>
                      <p className="text-xs">On this board</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onLocate(item.itemId)}
                      >
                        Locate
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onAdd(item.itemId)}
                    >
                      Add to board
                    </Button>
                  )}
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
