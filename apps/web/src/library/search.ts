export type Layout = "list" | "grid";
export interface LibrarySearch {
  layout?: Layout;
  item?: string;
}

/**
 * Unknown values become explicit `undefined`: the router merges parent search
 * under a route's own result, so omitting the key would let a raw bad value leak.
 */
export function validateLibrarySearch(
  search: Record<string, unknown>,
): LibrarySearch {
  const { layout, item } = search;
  return {
    layout: layout === "grid" || layout === "list" ? layout : undefined,
    item: typeof item === "string" && item ? item : undefined,
  };
}
