# Verification: search-and-filters

Date: 2026-10-07. Branch: `feature/web-shell` (uncommitted at the time of writing).
Spec: [SPEC-search-and-filters.md](../../SPEC-search-and-filters.md). Plan: [tasks/plan.md](../../tasks/plan.md).
Items marked **open** are manual checks not yet done.

## Automated

| Check               | Result                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm test` backend | 15 files, 176 tests pass (pure rules, writers, invariant, queries, recount)                    |
| `pnpm test` web     | 24 files, 259 tests pass (params, routes, search box, filter bar, library search, inbox count) |
| `pnpm typecheck`    | 6 of 6 workspaces pass                                                                         |
| `pnpm build`        | web, Chrome extension, and Android export build                                                |
| `pnpm format:check` | Fails only on `.mcp.json`, committed unformatted earlier and untouched here                    |

Mutation checks (breaking one line, expecting a test to fail) were run by hand on the writers, the queries, the search
box and the filter bar; every surviving mutant found a test gap that was then closed, apart from one equivalent mutant
(the blank-search guard: the router ignores a navigation to the same location).

## Success criteria

| #   | Criterion                                                    | Evidence                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `pnpm check` passes, zero counter drift                      | Parts pass; `format:check` fails only on `.mcp.json`. The invariant test (16 seeded sequences, checked after every step) and the recount tests show zero drift                                                                                         |
| 2   | Search finds title, note text, extracted text; owner-only    | `itemQueries.test.ts` (note, title, extracted text, foreign owner). **On the real dev deployment** a probe found a saved link by `reui`, `reui.io`, `REUI`, `reu`, `sonner`, `components`. "Best match first" is **open** (test harness does not rank) |
| 3   | Source chips, Needs review drop an item when resolved        | Backend: every filter combination and the review state change on confirm/remove (`itemState.writers.test.ts`, `itemQueries.test.ts`). Web: chips and toggle update the URL (`FilterBar.test.tsx`). **Open:** the live walk-through in the app          |
| 4   | Inbox contents and sidebar count agree, update live          | Same counters the invariant test checks against a full recompute; badge shows 0/loading/99+ correctly (`InboxCount.test.tsx`). Mocks are not reactive, so **live agreement is open**                                                                   |
| 5   | URL round trip for `q`, `source`, `review`, `layout`, `item` | `searchParams.test.ts`, `router.test.tsx` (invalid values fall back), `SearchBox.test.tsx` (back/forward mirrors the box), `FilterBar.test.tsx` (replace, not push)                                                                                    |
| 6   | Bounded reads                                                | Pages clamp to 10 items; previews keep the 40-link and 30-label bounds; `stats` reads one document; recount batches of 20 items; link fan-out 100 per transaction (250-link test). No test counts raw reads                                            |
| 7   | Accessibility, 390px, keyboard                               | Not pursued beyond roles and names in tests: the owner chose to skip axe and Lighthouse for this personal app. Keyboard behavior is tested (below). **390px layout is open** (manual)                                                                  |

## Keyboard

| Key                     | Does                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `/`                     | Focuses the sidebar search box from anywhere outside a text field (not with Ctrl/Cmd/Alt) |
| Enter in the search box | Searches the current view (Library, Inbox, or the open label); elsewhere opens Library    |
| Esc in the search box   | Clears the text and removes the query, keeping source and review filters                  |
| Enter/Space on a chip   | Selects a source or toggles Needs review (native buttons)                                 |

## Deviations from the spec

- **Search runs in the current view.** The spec first said Enter always opens `/library`; Inbox and label pages now stay
  where they are (spec updated).
- **Index shape.** `[ownerId, needsReview, sourceKind]` queried without a source orders by source first, so every filter
  combination has its own index (spec updated).
- **Repair for existing data.** `recountOwnerStats` also repairs link rows and is how data saved before this feature is
  indexed; re-seeding does not do that (spec updated).
- **No axe or Lighthouse**, by the owner's decision (T16).
- **No search-as-you-type, no per-source counts, no label-name search**, as scoped.

## Open manual checks

- [ ] In the app: search a word from a note, a link and a title; filter by each source; toggle Needs review; label an
      Inbox item and watch it and the sidebar count update; filter and search inside a label; "Search all".
- [ ] Relevance order of results on a real deployment (a closer match should come before a weaker one).
- [ ] Convex accepts `maximumRowsRead` when paginating a search query (label search); `items.search` does not set it.
- [ ] 1440px and 390px against design section 02: filter bar scrolls inside itself, no page-level horizontal scroll.

## T2 spike: search indexes (Convex 1.46.0, convex-test 0.0.60)

Sources: [Full text search](https://docs.convex.dev/search/text-search),
[Platform limits](https://docs.convex.dev/production/state/limits), read 2026-10-07, and the installed `convex-test`
source (`dist/index.js`, the "Search" case of the query planner).

### Confirmed against the docs (production behavior)

- A search query is one `.search(field, text)` plus any number of `.eq(filterField, value)`; filters are **equality only**.
  Absent fields are matched with `.eq("field", undefined)`, so an absent `needsReview` can be filtered as "false".
  The specs treat "absent = false", so queries only add the filter when the toggle is on.
- `.paginate(opts)` works on search queries. `.collect()` throws past 1024 documents.
- **Prefix matching is on the last term only**; other terms must match whole words. No typo tolerance.
  Terms are lowercased and limited to 32 characters; text is split on whitespace and punctuation (Tantivy simple tokenizer).
- **Search queries scan at most 1024 results**, so "Load more" can end before every match is shown. The UI shows
  "N loaded", never a total (as the spec says).
- Limits: 4 search indexes per table (we use 1 per table), 16 filter fields per index (we use 4 and 5), 32 indexes
  per table (items has 6, itemLabels has 8), **16 terms per query, 8 filter expressions per query**.
  → Action for T9/T10: clamp or reject queries with more than 16 words (`INVALID_INPUT`) instead of letting Convex throw.
- **Cost:** search queries are billed per query-GB of the _whole index size_, regardless of results or filters. Keeping
  `searchText` bounded (8,000 characters per item, 1,000 per link) keeps the index small. Worth watching if a library
  grows large; no change needed now.

### What `convex-test` 0.0.60 does differently (affects how we test)

- **No relevance ranking.** Results are not ordered by score, so "best match first" cannot be asserted in unit tests.
  It is a manual check (**open**) against a real dev deployment.
- **Every query term matches by prefix and any term matches (OR).** Real Convex only prefix-matches the last term. Tests
  can assert _which documents match a single word_ and ownership/filter behavior, not multi-word semantics.
- **A document without the search field crashes the query** (`Cannot read properties of undefined (reading 'split')`);
  real Convex skips it. Test fixtures that exercise search must give every row of that table a `searchText`. Production
  writers always set it (T3+); only raw test inserts could omit it.
- Filters (`eq`, including `undefined`) and `.paginate` work; the spike test (`convex/search.spike.test.ts`) proves it.

### Result

The new schema, the four browse indexes, both search indexes and `ownerStats` load in `convex-test`; filtered, paginated
search runs with the owner filter enforced. No blocker; continuing with T3.

## T7: invariant test and recount

- `convex/itemState.invariant.test.ts` runs 16 seeded random sequences of 100 steps (create, attach, remove, confirm an
  unsure link, start decision/enrichment, finish or fail a pending run, delete) and compares stored flags, link fields and
  counters to an independent from-scratch oracle **after every step**. A failing seed is reproducible by its number.
- The oracle reads every link and run, not the production bounded reads. They agree except for one deliberate
  definition: labeling is "in flight" only if a pending decision run is among the three newest runs (spec, same as
  `previewItems`). The first run of the stronger test found this mismatch; the oracle now states it.
- **Mutation check (done by hand):** removing the refresh call from `confirm`, `decide`, `decisions.complete`,
  `finishRun`, `processingRuns.start`, the `unsure` writes in `confirm` and `complete`, the `items.remove` counter
  decrement, or the link fan-out each makes the test fail. Weakly generated sequences initially let several of these
  survive, so the generator is weighted to settle runs and to confirm real unsure links.
- `recountOwnerStats` (internal, batched by 20 items with a scheduled continuation carrying the totals) reports
  `{ done, itemsRepaired, statsRepaired }`, repairs corrupted flags and counters, creates a missing counters row, is
  idempotent, and only touches the named owner. It does not rewrite link rows (the fan-out does that on a text change).

## T8-T10: read queries

- `items.list`, `items.search`, `items.stats`, `itemLabels.listItemsForLabel` and `itemLabels.searchItemsForLabel` are
  covered by `convex/itemQueries.test.ts` (21 tests): owner scoping, every filter combination, newest-first order, 10 per
  page without duplicates, foreign labels read as "Not found", authentication, and bounded previews (no `searchText` or
  `ownerId` leaks).
- **Index fix found while writing them:** `[ownerId, needsReview, sourceKind]` queried without a source orders by
  `sourceKind` first, not newest first. Each filter combination therefore has an index that constrains every field
  (`by_owner_review`/`_source`, `by_owner_inbox`/`_source`, `by_owner_label_unsure`/`_source`). Spec updated.
- `false` and absent both mean "no filter" for `needsReview` and `inbox`; `needsReview` wins over `inbox` (it is a subset).
- Search queries are trimmed and rejected (`INVALID_INPUT`) when blank, over 200 characters, or over 16 words (Convex's cap).
- More `convex-test` differences: it splits words on whitespace only (Convex also splits on punctuation), so a URL is one
  "word" there. Tests search notes by word and URLs by their scheme (`https`).
- **Checked on the real dev deployment (2026-10-07, throwaway probe, removed afterwards):** a saved link
  `https://reui.io/components/sonner` is found by `reui`, `reui.io`, `REUI`, the prefix `reu`, `sonner`, `components`,
  `io`, `reui sonner` and `reui.io/components`. So real Convex splits URLs on punctuation and matches case-insensitively,
  which `convex-test` does not.
- **Still open, needs a real run:** relevance order, and that `maximumRowsRead` is accepted when paginating a search query.
- **Existing data:** items saved before this feature have no `searchText`, so search could not find them (the first report
  of "search doesn't find my reui link"). Run the repair once per owner on a deployment that has older data:
  `pnpm --filter @mindspool/backend exec convex run itemState:recountOwnerStats '{"ownerId":"<tokenIdentifier>"}'`
  (repeat until `done: true`; a second run should report all zeros). It fills item and link fields and the counters.
  Ran it on the dev deployment: 13 items and 13 links repaired, then zeros.
- **Bug found by that run:** the repair derived an item's `needsReview` before repairing its links' `unsure` flag, so a
  legacy item with an unsure label needed a second run. Links are now repaired first; the backfill test builds a library
  that has an unsure label so the order is covered.
