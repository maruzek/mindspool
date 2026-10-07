# Spec: library-view

Module id `library-view` in [CAPABILITY-MAP-web-redesign.md](CAPABILITY-MAP-web-redesign.md). Depends on the implemented
`web-shell` and the existing `core-library` backend. Design source: `Mindspool Base Modernist v3.dc.html`, section 02
(capture bar, list and grid, rows and cards). The right-hand inspector is `item-inspector`, specified separately.

## Objective

Restore the ability to save and browse items, rebuilt in the Modernist design: a capture bar, a paginated
list or grid of the owner's items, and the same view filtered to one label. Saving is instant and never loses input.

Success looks like: a signed-in user pastes a link or writes a note, presses Save, and sees it at the top of the Library
immediately with its true processing state; switches between list and grid; opens a label and sees only its items; and
loads older items a page at a time. A failed or interrupted save keeps the input and its retry key, exactly as before.

This module also carries the regression debt from the web-shell rewrite: the failed-then-retried save, whitespace
preservation, and capture-key reuse tests that were dropped with the old save form.

## Assumptions

1. Routes stay as built: `/library` (all items) and `/labels/$labelId` (one label). `/inbox` stays a placeholder until
   `search-and-filters`.
2. One capture input. A single auto-growing textarea decides URL versus note at save time: the trimmed value parses as an
   `http`/`https` URL with no whitespace and no embedded credentials, otherwise it is saved as text. The original input is
   stored verbatim, never the trimmed value.
3. Selection lives in the URL (`?item=<id>`) so the inspector can deep-link later. Without the inspector, selecting an item
   only highlights its row and reserves the 380px right column, which stays hidden until `item-inspector` mounts into it.
4. Layout (`?layout=list|grid`, default `list`) is a URL search param, not stored.
5. The design's source chips, "Needs review", and item counts need server-side facets and counting. They move to
   `search-and-filters`. This module shows the page heading and the number of loaded items only when more than zero.
   The capability map is amended accordingly.
6. Image drop and file upload are out of scope: the backend has no ownership-checked upload flow. The placeholder reads
   "Paste a link or write a note…".
7. Thumbnails use the design's hatched tonal tile with a kind icon (link, note). External image references are not rendered
   because no image binaries are fetched yet.
8. Brand icons: the user supplied monochrome SVGs (X, Instagram, TikTok, YouTube, Reddit; Simple Icons style, one path,
   `viewBox="0 0 24 24"`), copied to `apps/web/src/assets/brands/`. They are wrapped as a `BrandIcon` component that
   renders `currentColor`, so no dependency is added. Hosts map as `x.com`/`twitter.com` → X, `instagram.com`,
   `tiktok.com`, `youtube.com`/`youtu.be`, `reddit.com`/`redd.it`; any other host gets a Globe and notes get a note icon.
9. Reuse, adapt, and tighten the existing `packages/ui/src/components/mindspool/*` (`ItemRow`, `ItemCard`, `ItemThumb`,
   `LabelTag`, `SegmentedControl`, `ProcessingStatus`) and the ReUI `badge`. Remove any that this module does not use.

## Tech Stack

React 19.2, TanStack Router (typed search params via `validateSearch`, no new dependency), Convex 1.46
(`usePaginatedQuery`, `useMutation`), shadcn `base-nova` + ReUI, Clerk, Vitest + Testing Library. No new packages.

## Backend change (approval needed: ask-first item)

Row display needs fields the current preview lacks, and fetching them per row from the client would open one
subscription per visible item. Extend the **preview** shape returned by `items.list` and `itemLabels.listItemsForLabel`
(`itemPreview` in `validators.ts`) with:

| Field              | Source                                   | Purpose                             |
| ------------------ | ---------------------------------------- | ----------------------------------- |
| `enrichmentStatus` | the item                                 | processing state on the row         |
| `captureSource`    | the item                                 | meta line ("via browser extension") |
| `originalUrl`      | the item, optional                       | host and URL title fallback         |
| `labels`           | up to 3 included labels: `{ _id, name }` | confirmed tags on the row           |
| `labelCount`       | count capped at 4 → shown as `+N`        | overflow tag                        |

Bounds: a joined page is at most 10 items, matching the existing joined-read limit in `docs/core-concepts.md`; each item reads at
most 4 `itemLabels` rows through `by_owner_item_decision` and at most 3 label documents. Full content stays out of
previews. No schema or index changes. Tests cover ownership (foreign items and labels never appear), tombstoned
(`exclude`) labels never appear, the 10-item cap, and the unchanged preview truncation (160 characters, 512 for titles).

## Commands

```
Dev:        pnpm dev:web
Test:       pnpm --filter @mindspool/web test        pnpm --filter @mindspool/backend test
Typecheck:  pnpm --filter @mindspool/web typecheck
Build:      pnpm --filter @mindspool/web build
All checks: pnpm check
```

## Routes and URL state

| Path               | Search params                               | Notes                                                                                                |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/library`         | `layout` (`list`\|`grid`), `item` (item id) | `items.list`                                                                                         |
| `/labels/$labelId` | same                                        | `itemLabels.listItemsForLabel`; heading is the label name; unknown label keeps the shell's Not found |

Invalid or unknown `layout` values fall back to `list`. An `item` id that is not on a loaded page still renders (the
inspector will resolve it); this module only highlights a row when it is present.

## Project Structure

```
apps/web/src/library/
  LibraryView.tsx         heading, capture bar, layout toggle, list/grid, pagination (shared by both routes)
  CaptureBar.tsx          textarea + Save, uses the draft context and items.create
  ItemList.tsx            rows
  ItemGrid.tsx            cards
  ItemEmpty.tsx           empty and error states
  itemDisplay.ts          title, host, kind, relative date, URL detection (pure)
  BrandIcon.tsx           host → brand SVG (currentColor) or Globe
  search.ts               validateSearch for layout and item
  *.test.tsx, itemDisplay.test.ts
apps/web/src/routes/_app/library.tsx, labels.$labelId.tsx    mount LibraryView
packages/ui/src/components/mindspool/    adapted components; unused ones removed
packages/backend/convex/{items,itemLabels,validators}.ts     preview extension + tests
```

## Behavior

**Capture**

- Save is enabled for non-blank input; Enter saves, Shift+Enter inserts a newline; the field grows with its content.
- First save attempt assigns `captureKey` into the draft (`crypto.randomUUID()`), then calls `items.create` with
  `captureSource: "web"`. Editing the input clears the key; a failed save keeps both input and key so a retry reuses the key.
- On success the draft is cleared only if its key still matches the saved one (an older save must not erase newer input),
  focus returns to the field, a polite `role="status"` announces "Saved", and the new item appears first.
- Failures show the backend message through `errorMessage`, in `role="alert"`, without clearing input.
- Limits follow the backend: URL 8,192 characters, text 100,000. Input past the limit shows an inline message before sending.

**List and grid**

- Row: thumb tile, title, meta line (brand or Globe icon, host or "note", "via <source>"), confirmed label tags (max 3, then `+N`), date.
  Title is `sourceMetadata.title`, else the host and path for URLs, else the first non-empty line of a note.
- Processing line: `not_started` → "Saved — original stored"; `pending` → "Processing…"; `succeeded` → no extra line;
  `failed` → "Extraction failed — link kept" (no Retry until `label-suggestions`).
- Grid: 3 columns at 1280px and above, 2 from 768px, 1 below; card = tile, source line, title, tags.
- Rows and cards are links to `?item=<id>` (keyboard focusable, `aria-current` on the selected one). The 2px divider and
  accent inset bar for the selected row follow the design.
- Pagination: 10 items per page with a "Load more" button, announced while loading; no infinite scroll.
- Loading: skeleton rows. Empty (no items): "Your library starts here." with the prompt to paste a link; an empty label
  explains that items are added from an item's labels. Errors surface through the shell's boundary.
- Dates are relative ("4m", "2h", "3d", then a short date); they use one clock source so tests can fix time.

**Responsive**: below 768px the label tags column hides in rows and the capture bar stacks above the layout toggle.

## Code Style

Tokens only; zero radius and 2px rules; component states from the registry.

```tsx
<ItemRow
  thumb={<ItemThumb kind={display.kind} />}
  title={display.title}
  source={<SourceLine host={display.host} via={item.captureSource} />}
  labels={
    <Tags labels={item.labels} extra={item.labelCount - item.labels.length} />
  }
  date={display.date}
  selected={item._id === selectedId}
  render={<Link to="." search={(s) => ({ ...s, item: item._id })} />}
/>
```

## Testing Strategy

Vitest and Testing Library with the shared Clerk/Convex mocks; backend with `convex-test`.

- Regression (owed from web-shell): capture draft survives a failed save and an auth interruption; the retry reuses the
  same key; whitespace in a note is preserved verbatim; an older save finishing does not erase newer input; successful save
  clears the draft and storage.
- Capture bar: URL versus note detection (credentials, spaces, scheme), Enter and Shift+Enter, limits, error alert.
- `itemDisplay`: titles, hosts, kinds, relative dates with a fixed clock.
- List and grid: rows from a mocked page, tag overflow, processing lines, layout toggle updates the URL, selection sets
  `?item` and `aria-current`, load more, loading, empty, and label-filtered variants.
- Backend: preview shape, caps, ownership, tombstones (see Backend change).
- Manual: compare with design section 02 at 1440px and 390px; record in `docs/verification/library-view.md`.

## Boundaries

- Always: store the original input verbatim; keep capture keys stable across retries; tokens not hex; run `pnpm check`
  before committing; keep joined reads bounded.
- Ask first: the preview extension in `validators.ts`/`items.ts`/`itemLabels.ts`, adding dependencies (a
  virtualizer), any schema or index change, image upload.
- Never: weaken or delete the draft and ownership tests, fetch or store image binaries, read unbounded rows in a list
  query, expose another owner's labels or items, restyle registry components with ad-hoc CSS.

## Success Criteria

1. `pnpm check` passes with the owed regression tests present; no test dropped without replacement.
2. A pasted link and a multi-line note both save, appear first with the correct title and processing line, and the note's
   whitespace is intact in storage.
3. A save that fails (offline, rejected) and is retried creates exactly one item; the draft and key survive an auth
   interruption and a page reload.
4. `/library` and `/labels/<id>` show only the owner's items; a label shows only its included items; pages load 10 at a time
   with no duplicates and a working "Load more".
5. List and grid match design section 02 at 1440px; at 390px no horizontal scroll and a single-column grid.
6. Layout and selection round-trip through the URL, survive reload and back/forward, and rows are keyboard operable.
7. The backend preview stays bounded: one page never reads more than 10 items, 40 `itemLabels` rows, or 30 label documents.
8. Accessibility: axe-clean in tests where feasible, Lighthouse accessibility at least 95, capture feedback announced.

## Decisions (open questions resolved)

1. The preview extension is approved: `items.list` and `itemLabels.listItemsForLabel` return `enrichmentStatus`,
   `captureSource`, `originalUrl`, up to three labels, and an overflow count.
2. Page size is 10 for both queries, so one code path and one set of limits.
3. No item counts in the header until `search-and-filters`.
4. Brand icons use the supplied SVGs (see Assumption 8); no new dependency.
5. After saving, the new item is highlighted, not opened.

## Open Questions

None. The next gate is the plan and task list.
