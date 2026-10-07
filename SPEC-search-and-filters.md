# Spec: search-and-filters

Module id `search-and-filters` in [CAPABILITY-MAP-web-redesign.md](CAPABILITY-MAP-web-redesign.md). Depends on the implemented
`library-view` (and through it `item-inspector` and `clef-labeling`, whose "unsure" model labels this module surfaces).
Design source: `Mindspool Base Modernist v3.dc.html`, section 02 (sidebar search box and Inbox count, source chips,
"Needs review", and the "42 items · 6 awaiting review" heading).

## Objective

Let the owner find and triage items without scrolling: type in the sidebar search box to find items by what they
say, narrow the Library by where an item came from, jump to items that need a decision, and use the Inbox as the
"things that still need me" queue.

Success looks like: a user types "ramen" in the sidebar, presses Enter, and sees only their items whose title, note text,
link, or extracted text match, best match first; taps the X chip to keep only items saved from X; taps "Needs review" to see
items with unconfirmed model labels; and opens Inbox to see everything unlabeled, still processing, or awaiting review, with
a count in the sidebar that stays correct as they label things.

## Assumptions

1. Search is **full-text over the owner's items only** (title, note text, URL, description, author, site name, extracted
   text), using a Convex search index. It does not match label names and is not semantic or fuzzy beyond what Convex
   full-text search does (prefix match on the last term, no typo tolerance).
2. The sidebar box submits to `/library?q=<text>` (Enter; no search-as-you-type). Search, source, and "Needs review" are
   URL search params on `/library` and `/inbox`, so they deep-link, survive reload, and work with back/forward.
3. **Label pages (`/labels/$labelId`) get the same search and filters, scoped to that label** (approved). A label's items are
   reached through `itemLabels`, so the item fields the filters need are denormalized onto the link row (see Backend change).
   Searching from the sidebar while on a label page searches **within that label**; a "Search all" chip in the results
   heading widens it to the whole library. In a label, "Needs review" means _this label on the item is an unsure model
   label_ (a link-level fact), which is the useful question there; in Library and Inbox it means any unsure label on the item.
4. **Source** is a single-select facet: All, X, Instagram, TikTok, YouTube, Reddit, Web (any other link), Notes. The design's
   "Images" chip is dropped: there is no image capture yet. Hosts map exactly as `BrandIcon` does today.
5. **Needs review** = the item has at least one included model label that is still unsure (`origin: "model"`, no
   `confirmedAt`, confidence below `UNSURE_THRESHOLD` 0.65), the same rule `previewItems` uses today.
6. **Inbox** = items that need attention: no included labels, **or** enrichment or labeling in flight (`enrichmentStatus
pending`, or a pending `decision` run), **or** needs review. "Needs review" is therefore a subset of Inbox.
   "In flight" for labeling means a pending `decision` run among the item's three most recent runs (the same window
   `previewItems` uses), so a hung run buried under newer ones does not hold an item in the Inbox forever.
7. Counts come from a small per-owner counters document, not from scanning items (an item can be 100,000 characters,
   so counting by reading documents would blow the per-query read budget). The sidebar shows the Inbox count; the Library
   heading shows "N items · M awaiting review" when no search or filter is active.
8. No migration is scheduled. Rows written before this change have no flags or search text, so they do not match search or
   filters. Re-seeding only adds sample items, so it does not fix real saved items; instead run `recountOwnerStats` once
   per owner (see the verification file). It repairs items, their links and the counters, and doubles as the drift check.
9. Search never reads or returns full content: results use the same bounded `itemPreview` as every list.

## Tech Stack

Convex 1.46 (`searchIndex`, `withSearchIndex`, `.paginate`, `usePaginatedQuery`), TanStack Router typed search params,
shadcn `base-nova` + ReUI (existing `SegmentedControl`/badge/chip patterns), Vitest + Testing Library + `convex-test`.
No new packages.

## Backend change (approval needed: ask-first items)

All of the following are schema or index changes and were approved with the plan request.

**New optional fields on `items`** (absent on rows written before this change; dev data is re-seeded):

| Field         | Type                                                           | Maintained by                                                 |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `searchText`  | string, at most 8,000 chars                                    | create; enrichment results (title, description, text) written |
| `sourceKind`  | `x`\|`instagram`\|`tiktok`\|`youtube`\|`reddit`\|`web`\|`note` | create (from `originalUrl` host or `inputType`)               |
| `needsReview` | boolean (absent = false)                                       | every code path below                                         |
| `inbox`       | boolean (absent = false)                                       | every code path below                                         |

`searchText` joins `sourceMetadata.title`, `description`, `author`, `siteName`, the first 512 characters of `originalInput`,
and the leading part of `extractedText`, truncated to 8,000 characters. The title is placed first.

**New indexes on `items`:**

```
searchIndex  search_text   searchField "searchText", filterFields ["ownerId","sourceKind","needsReview","inbox"]
index        by_owner_source  ["ownerId","sourceKind"]
index        by_owner_review         ["ownerId","needsReview"]
index        by_owner_review_source  ["ownerId","needsReview","sourceKind"]
index        by_owner_inbox          ["ownerId","inbox"]
index        by_owner_inbox_source   ["ownerId","inbox","sourceKind"]
```

Each combination has an index whose equality fields are all used, because Convex appends `_creationTime` last: leaving an
earlier field unconstrained would order by that field first, not newest first. So `review` and `review+source` have separate
indexes, as do `inbox` and `inbox+source`, plus `source` alone. "Needs review" within Inbox reads the review indexes (it is a
subset).

**New optional fields on `itemLabels`** (denormalized from the item so label-scoped queries stay bounded):

| Field        | Type                        | Maintained by                                                             |
| ------------ | --------------------------- | ------------------------------------------------------------------------- |
| `sourceKind` | same union as on `items`    | link create; item `sourceKind` never changes after create                 |
| `unsure`     | boolean (absent = false)    | link create, `confirm`, remove/re-add, model apply (the link's own state) |
| `searchText` | string, at most 1,000 chars | link create; item title/text changes fan out to its links                 |

`searchText` on a link is the item's title, site name, and first 512 characters of `originalInput` (no extracted text:
it is repeated per label, so it is kept short). Fan-out on an item text change patches at most 100 links inline and
schedules an internal continuation for the rest, so one transaction never touches more than 100 link rows.

**New indexes on `itemLabels`:**

```
searchIndex  search_link  searchField "searchText", filterFields ["ownerId","labelId","manualDecision","sourceKind","unsure"]
index        by_owner_label_source  ["ownerId","labelId","manualDecision","sourceKind"]
index        by_owner_label_unsure         ["ownerId","labelId","manualDecision","unsure"]
index        by_owner_label_unsure_source  ["ownerId","labelId","manualDecision","unsure","sourceKind"]
```

```
index        by_owner_item_unsure   ["ownerId","itemId","manualDecision","unsure"]
```

(`by_owner_label_decision` stays for the unfiltered case. `by_owner_item_unsure` lets `refreshItemState` ask "does this item
have any unsure included link?" with a single `.first()`, instead of reading every link; the 4-link window `previewItems`
uses would miss an unsure link beyond the fourth.)

**New table `ownerStats`** (one row per owner, `index by_owner`): `{ ownerId, total, inbox, needsReview }`, adjusted by deltas
inside the same transaction as the change. An internal `recountOwnerStats` mutation rebuilds it (batched) to detect and repair drift.

**One maintenance helper**, `refreshItemState(ctx, itemId)` in a new `convex/itemState.ts`: reads one included link
(`by_owner_item_decision` `.first()`: "is it unlabeled?"), one unsure link (`by_owner_item_unsure` `.first()`), at most 3
recent runs, and the item; recomputes
`needsReview`, `inbox`, and `searchText`; patches only when something changed; and adjusts `ownerStats` by the difference.
It is called from every writer that can change those inputs, and from nowhere else:

| Writer                                       | Why                                        |
| -------------------------------------------- | ------------------------------------------ |
| `items.create`                               | new item is unlabeled → inbox; sets fields |
| `items.remove`                               | decrement `total` and any flags            |
| `itemLabels.attach` / `remove` / `confirm`   | link set or confirmation changed           |
| `decisions` apply results + run start/finish | model links added; labeling pending        |
| `processingRuns` start/finish/enrichment     | `enrichmentStatus`, title, extracted text  |

A test asserts the invariant directly: after any sequence of those operations, the stored flags and counters equal a
recomputation from scratch (`recountOwnerStats` finds zero drift).

**Queries** (all owner-scoped, page size 10 = `PREVIEW_PAGE_SIZE`, results through the existing `previewItems`):

| Function                         | Args                                                                                             | Behavior                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `items.list`                     | `paginationOpts`, optional `source`, `needsReview`, `inbox`                                      | picks the index above; no args = today's behavior                                    |
| `items.search`                   | `paginationOpts`, `query` (1 to 200 chars after trim), optional `source`, `needsReview`, `inbox` | `withSearchIndex` with `ownerId` always set; relevance order                         |
| `itemLabels.listItemsForLabel`   | adds optional `source`, `needsReview`                                                            | picks `by_owner_label_*`; no args = today's behavior                                 |
| `itemLabels.searchItemsForLabel` | `labelId`, `query`, optional `source`, `needsReview`, `paginationOpts`                           | `withSearchIndex` on `search_link`, relevance order; items joined via `previewItems` |
| `items.stats`                    | none                                                                                             | `{ total, inbox, needsReview }` from `ownerStats`; zeros when no row                 |

Bounds: `search` and `list` read at most 10 items per page and the same 40 link / 30 label documents as library-view;
`stats` reads one document. A blank or over-long query is `INVALID_INPUT`.

## Commands

```
Dev:        pnpm dev:web
Test:       pnpm --filter @mindspool/web test        pnpm --filter @mindspool/backend test
Typecheck:  pnpm --filter @mindspool/web typecheck   pnpm --filter @mindspool/backend typecheck
Build:      pnpm --filter @mindspool/web build
All checks: pnpm check
Recount:    pnpm --filter @mindspool/backend exec convex run itemState:recountOwnerStats   (drift check; dev data is re-seeded, no backfill)
```

## Routes and URL state

| Path               | Search params                                   | Data                                                                                                                                    |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/library`         | `layout`, `item`, `q`, `source`, `review` (`1`) | `items.search` when `q`, else `items.list`                                                                                              |
| `/inbox`           | same                                            | same with `inbox: true`                                                                                                                 |
| `/labels/$labelId` | same (`inbox` n/a)                              | `itemLabels.searchItemsForLabel` when `q`, else `listItemsForLabel`; `scope=all` on a label route redirects the search to `/library?q=` |

`source` outside the allowed set and `review` other than `1` fall back to unset (same normalizer pattern as
`validateLibrarySearch`: explicit `undefined`, never a leaked raw value). `q` is trimmed; a blank `q` is unset. Changing `q`,
`source`, or `review` drops `item` (the selected item may no longer be in the results). `layout` is kept.

## Project Structure

```
apps/web/src/search/
  SearchBox.tsx          sidebar input: Enter submits to /library?q=, "/" focuses, Esc clears, mobile sheet too
  FilterBar.tsx          source chips + Needs review toggle + active-search chip with clear
  searchParams.ts        validate/normalize q, source, review; merge helpers (pure)
  *.test.tsx, searchParams.test.ts
apps/web/src/library/LibraryView.tsx     reads the new params, picks list vs search, renders FilterBar and summary
apps/web/src/routes/_app/{library,inbox}.tsx   mount LibraryView with `inbox` on Inbox
apps/web/src/shell/AppSidebar.tsx, nav.ts      enable the box; Inbox count badge from items.stats
packages/backend/convex/
  itemState.ts           refreshItemState, sourceKindOf, buildSearchText, recountOwnerStats
  schema.ts, validators.ts, items.ts, itemLabels.ts, decisions.ts, processingRuns.ts
```

## Behavior

**Search box**

- Enabled in the sidebar (replaces the "coming soon" tooltip). Enter with non-blank text searches **the view you are in**:
  Library, Inbox, or a label page keep their route, filters and `layout` and set `q`; from any other route it opens
  `/library?q=…`. (Changed from "always `/library`" during T12: searching the Inbox from the Inbox is what a user expects,
  and it is the same rule that keeps a label search inside its label.) Blank Enter does nothing. The box reflects the current
  `q` and follows back/forward. `/` focuses it from anywhere outside a text field (ignored with Ctrl/Cmd/Alt); Esc clears
  the text and removes `q` but keeps the other filters.
- Results page heading: `Results for “ramen”` with a clear button (removes `q`, keeps filters). Summary line: "N loaded"
  (never a total: search has no cheap total) and a "Load more" button, as in the library.
- No results: "Nothing matches “ramen”." with the active filters named and one-click clear of each.
- Search is announced: `role="status"` "Searching…" while loading, "No results" or "Showing results" afterward.
- Filters stay applied while searching (source, review are filterFields); Inbox plus search works the same way.

**Filter bar** (Library and Inbox)

- Chips: All sources, X, Instagram, TikTok, YouTube, Reddit, Web, Notes; a divider; "Needs review" toggle (sparkles icon).
  Source is one-of (radio-group semantics, `aria-pressed` on the toggle); chips use brand icons from `BrandIcon`.
- All chips render always (no per-source counts; the design shows none). A source with no items shows the empty state.
- Below 768px the bar scrolls horizontally inside its own container; the page itself never scrolls sideways.
- Selecting a chip updates the URL (replace, not push, within the same view) and resets pagination.

**Inbox**

- Sidebar badge shows `inbox` from `items.stats`, capped display "99+", hidden at 0. The Library heading summary
  "N items · M awaiting review" uses `total` and `needsReview` and shows only when no search or filter is active.
- Inbox lists newest first; items leave it live as the user labels them or confirms/removes unsure labels (the reactive
  queries re-run when `inbox` flips). Empty: "Inbox zero. Everything is labeled." with a link to Library.
- The Inbox page has the same capture bar, layout toggle, filter bar, and selection as Library.

**Stats freshness**: counters change in the same transaction as the item, so the badge is never ahead of the list.

## Code Style

Same as library-view: tokens only, zero radius, 2px rules, registry components. Pure helpers are unit-tested.

```ts
// itemState.ts
export function sourceKindOf(item: {
  inputType: "url" | "text";
  originalUrl?: string;
}): SourceKind {
  if (item.inputType === "text" || !item.originalUrl) return "note";
  const host = hostOf(item.originalUrl);
  return HOST_KINDS.find(([re]) => re.test(host))?.[1] ?? "web";
}
```

## Testing Strategy

- **Backend (`convex-test`)**: `sourceKindOf` for every host and for malformed URLs; `buildSearchText` truncation and
  ordering; search matches title, note, extracted text; never returns another owner's items; source and review and inbox
  filters combine; blank/over-long queries rejected; page capped at 10; relevance order; `items.list` without args is
  unchanged. **Invariant test**: random sequences of create, attach, remove, confirm, decision apply, enrichment, delete,
  then `recountOwnerStats` reports zero drift and flags match a from-scratch recomputation. `recountOwnerStats` is idempotent.
- **Web**: `searchParams` normalization table; SearchBox submit, `/` focus, Esc clear, blank Enter; FilterBar chip
  selection updates URL and drops `item`; LibraryView chooses list vs search; no-results and clear actions; Inbox badge
  (hidden at 0, "99+"); a11y roles and announcements; router test that bad params fall back.
- **Manual**: compare with design section 02 at 1440px and 390px; record in `docs/verification/search-and-filters.md`.

## Boundaries

- Always: scope every search and list by `ownerId` (always set in `withSearchIndex`); keep reads bounded; change flags only
  through `refreshItemState`; run `pnpm check` before committing; keep tests for every maintained invariant.
- Ask first: the schema, index, and `ownerStats` changes above; any new dependency;
  search over label names or semantic search; changing the Inbox or Needs review definitions.
- Never: count by scanning item documents, return full content in a result, accept an owner from the client, patch
  `inbox`/`needsReview`/`searchText` outside the helper, weaken or delete existing tests.

## Success Criteria

1. `pnpm check` passes, including the invariant test with zero counter drift.
2. Searching a word from a saved note, a page title, and extracted text each finds that item; another owner's matching item
   never appears; results are best match first and load 10 at a time.
3. Each source chip shows only items of that source; "Needs review" shows exactly the items with an unsure model label and
   drops an item as soon as its last unsure label is confirmed or removed.
4. Inbox lists exactly the unlabeled, in-flight, or needs-review items; the sidebar count equals the number of Inbox items
   (verified by test against a recount) and updates live.
5. `q`, `source`, `review`, `layout`, and `item` round-trip through the URL, survive reload and back/forward; invalid
   values fall back silently.
6. A query never reads more than 10 items, 40 `itemLabels` rows, and 30 label documents; `stats` reads one document.
7. No horizontal page scroll at 390px; keyboard-complete (`/`, Enter, Esc, chips); axe-clean in tests where feasible;
   Lighthouse accessibility at least 95.

## Decisions (open questions resolved)

1. Counters: `ownerStats` table, exact counts (assumed from the recommendation; no objection raised).
2. In-label filtering is **in scope now** (denormalized onto `itemLabels`, see Backend change).
3. Enter-to-submit search, no search-as-you-type (assumed from the recommendation).
4. No backfill: dev data is re-seeded.
5. Inbox is as specified: unlabeled, in flight, or needs review.

## Open Questions

None. The next gate is the plan and task list.
