export type Layout = "list" | "grid";
export const SOURCES = [
  "x",
  "instagram",
  "tiktok",
  "youtube",
  "reddit",
  "web",
  "note",
] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<Source, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
  web: "Web",
  note: "Notes",
};

/** `review` is `1` (not `true`) so the URL reads `?review=1`. */
export interface LibrarySearch {
  layout?: Layout;
  item?: string;
  q?: string;
  source?: Source;
  review?: 1;
}

// Convex search rejects more than 16 words; a longer query is trimmed, not an error.
const MAX_WORDS = 16;
const MAX_CHARS = 200;

function normalizeQuery(raw: unknown) {
  // The router JSON-parses URL values, so `?q=2024` arrives as a number.
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const words = String(raw).trim().split(/\s+/).filter(Boolean);
  const q = words.slice(0, MAX_WORDS).join(" ").slice(0, MAX_CHARS).trim();
  return q || undefined;
}

/**
 * Unknown values become explicit `undefined`: the router merges parent search
 * under a route's own result, so omitting the key would let a raw bad value leak.
 */
export function validateLibrarySearch(
  search: Record<string, unknown>,
): LibrarySearch {
  const { layout, item, q, source, review } = search;
  return {
    layout: layout === "grid" || layout === "list" ? layout : undefined,
    item: typeof item === "string" && item ? item : undefined,
    q: normalizeQuery(q),
    source: SOURCES.find((known) => known === source),
    review: review === 1 || review === "1" || review === true ? 1 : undefined,
  };
}

/**
 * New search params after changing the query, source or review: validated,
 * `layout` kept, and `item` dropped because the selected item may no longer be listed.
 */
export function changeFilters(
  prev: LabelSearch,
  patch: Partial<Pick<LibrarySearch, "q" | "source" | "review">>,
): LibrarySearch {
  return { ...validateLibrarySearch({ ...prev, ...patch }), item: undefined };
}

export function hasFilters({ q, source, review }: LibrarySearch) {
  return Boolean(q || source || review);
}

export interface LabelSearch extends Omit<LibrarySearch, "layout"> {
  layout?: Layout | "board";
  trayScope?: "label" | "all";
  traySort?: "newest" | "oldest";
  trayLabel?: string;
}
export function validateLabelSearch(
  search: Record<string, unknown>,
): LabelSearch {
  return {
    ...validateLibrarySearch(search),
    layout:
      search.layout === "board"
        ? "board"
        : validateLibrarySearch(search).layout,
    trayScope:
      search.trayScope === "all" || search.trayScope === "label"
        ? search.trayScope
        : undefined,
    traySort:
      search.traySort === "oldest" || search.traySort === "newest"
        ? search.traySort
        : undefined,
    trayLabel:
      typeof search.trayLabel === "string" && search.trayLabel
        ? search.trayLabel
        : undefined,
  };
}
export function changeBoardFilters(
  prev: LabelSearch,
  patch: Partial<LabelSearch>,
): LabelSearch {
  return validateLabelSearch({ ...prev, ...patch });
}
