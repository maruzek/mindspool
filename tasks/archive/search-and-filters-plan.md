# Implementation Plan: search-and-filters

Spec: [SPEC-search-and-filters.md](../SPEC-search-and-filters.md) (approved: in-label filtering in scope, re-seed instead of
backfill, Inbox as specified, counters table, Enter-to-submit search). Capability map:
[CAPABILITY-MAP-web-redesign.md](../CAPABILITY-MAP-web-redesign.md), module 4 of 7 (build order puts `clef-labeling` after
it, but it is implemented, and this module surfaces its unsure labels). The `clef-labeling` plan and tasks are archived in
`tasks/archive/clef-labeling-*.md` (T6, the live Workers AI check, was marked finished by the user on 2026-10-07).
Tasks: [todo.md](todo.md).

## Overview

Make the library findable and triageable: a sidebar search box that runs full-text search over the owner's items, source
chips and a "Needs review" toggle, an Inbox of items that still need attention with a live count, and the same search and
filters inside a single label. Almost all the risk is in the backend, because every filter is an index and every flag is
denormalized. So: pure helpers and schema first, then the writers that keep flags correct (each with tests), then the
read queries, then the UI from the outside in.

## How each task is worked (read this before starting any task)

1. **Load the skills named in the task before writing code.** Each task lists them under `Skills`. The usual set:
   `convex-docs` (version-current Convex docs instead of memory) and `source-driven-development` for anything that uses a
   Convex or router API; `convex-design` / `convex-expert` for code under `convex/`; `test-driven-development` and
   `convex-test` for tests; `frontend-ui-engineering` (and the ReUI/shadcn MCP tools, reuse before hand-rolling) for UI;
   `incremental-implementation` for the loop; `verification-before-completion` before claiming a task done;
   `convex-reviewer` and `code-review-and-quality` at checkpoints.
2. **Sources you can supply.** Where a task depends on an API I should not guess from memory (Convex full-text search,
   search-index limits, pagination of search results, `convex-test` search support, TanStack Router search params), the
   task lists a `Sources` line. The user can paste a URL, a docs page, or a file for that line; I fetch the same pages
   myself with `convex-docs` when nothing is supplied, and say so if the installed version differs from the docs.
   The suggested pages are:
   - Convex full-text search: <https://docs.convex.dev/search/text-search>
   - Convex indexes and pagination: <https://docs.convex.dev/database/reading-data/indexes>, <https://docs.convex.dev/database/pagination>
   - Convex platform limits: <https://docs.convex.dev/production/state/limits>
   - `convex-test`: <https://docs.convex.dev/testing/convex-test>
   - TanStack Router search params: installed version's docs in `node_modules` or the project site.
3. **One task per turn; stop at checkpoints.** Do not start the next task without the user's go-ahead at a checkpoint.
   Commit only when asked, in logical commits with the Co-Authored-By trailer.
4. **Backend writes beyond the approved spec need a question first** (new dependency, any further schema or index change).
   Regenerate and commit `convex/_generated` when function signatures change (`pnpm --filter @mindspool/backend exec convex codegen`).

## Architecture Decisions

- **Denormalize, then index.** Convex has no joins or array-contains index, and an item can be 100,000 characters. So the
  facts that filters need (`sourceKind`, `needsReview`, `inbox`, `searchText`) live on `items`, and the ones that label
  filters need (`sourceKind`, `unsure`, `searchText`) live on `itemLabels`. Every list is an indexed range or a search
  index query, bounded to 10 items per page.
- **One writer.** `refreshItemState(ctx, itemId)` is the only code that patches `needsReview`, `inbox`, `searchText` on an
  item and adjusts `ownerStats`. It recomputes from bounded reads and patches only on change. Link-level fields
  (`unsure`, `sourceKind`, `searchText`) are written by one `linkSearchFields(item)` helper at link creation and by the
  confirm/remove paths. Writers call the helper; nothing else knows the rules.
- **Pure rules in one file.** `sourceKindOf`, `buildSearchText`, `buildLinkSearchText`, and `deriveFlags` are pure functions
  with their own tests (T1), so the rules are reviewed apart from Convex plumbing.
- **"Needs review" has two meanings by design** (spec Assumption 3): item-level in Library and Inbox, link-level inside a
  label. The link-level one needs no fan-out when a label is confirmed; only title/text changes fan out, in chunks of 100.
- **Counters in the same transaction.** `ownerStats` deltas are applied inside `refreshItemState`, so the badge is never
  ahead of the list. `recountOwnerStats` is a repair and drift-check tool; dev data is re-seeded, no backfill migration.
- **URL is the state.** `q`, `source`, `review`, `layout`, `item` are TanStack Router search params with explicit-undefined
  normalization (like `validateLibrarySearch`). Filter changes drop `item`.
- **Reuse the library.** One `LibraryView` serves Library, Inbox, and label pages; it picks the query from the params and
  route. No second list component.
- **Not in this module:** search over label names, semantic or typo-tolerant search, highlighting snippets, search-as-you-type,
  saved searches, sort options, image filters, per-source counts.

## Dependency Graph

```
T1 pure rules ──┬─ T2 schema + indexes + search spike ─ T3 refreshItemState + stats (create/remove) ─┬─ T4 link writers (attach/remove/confirm)
                │                                                                                   ├─ T5 decision writers (model links, runs)
                │                                                                                   └─ T6 enrichment writers + link fan-out
                │                                                          T7 invariant + recount (needs T4-T6)
                │                              T8 items.list filters + stats ─ T9 items.search        (need T3; T9 needs T2 spike)
                │                              T10 label queries: list filters + search               (need T4, T6)
                └─ T11 searchParams + routes ── T12 SearchBox ─ T13 LibraryView (list/search/inbox/label) ─ T14 FilterBar ─ T15 stats UI
                                                                                                           T16 a11y/responsive ─ T17 docs + verification
```

T4, T5, T6 are independent of each other after T3. T8 and T11 can start as soon as their inputs exist. The web phase
needs all queries (T8-T10) for real data but can be built against the mocks earlier; this plan keeps them sequential
because each task is one turn.

## Risks and Mitigations

| Risk                                                                                                                                                                                     | Impact | Mitigation                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search-index details are assumed from memory (equality-only filter fields, indexed term limits, result cap per query, pagination of search, `convex-test` support for `withSearchIndex`) | High   | T2 is a spike with a report, using the docs page above (supply it if you have it). It proves a search index, a filtered paginated query, and a `convex-test` run. If `convex-test` cannot run search, stop and ask before choosing a fallback |
| Flags drift from reality because some writer is missed                                                                                                                                   | High   | Single helper; T7 invariant test runs random sequences of every writer and compares with a from-scratch recompute; `recountOwnerStats` reports drift                                                                                          |
| The 4-link window used by `previewItems` would miss an unsure link beyond the fourth                                                                                                     | Med    | Spec adds `by_owner_item_unsure`; the helper uses `.first()` on it. A test with 6 links, the unsure one last                                                                                                                                  |
| Fan-out of title/text changes to many `itemLabels` rows breaks the transaction budget                                                                                                    | Med    | At most 100 links per transaction, an internal scheduled continuation for the rest; test with 250 links                                                                                                                                       |
| `ownerStats` write contention (capture and a model run finishing together)                                                                                                               | Low    | One document per owner, deltas not recounts; Convex retries OCC conflicts; single-user workload. T7 includes an interleaved case                                                                                                              |
| Search results capped (Convex returns a bounded number of matches per query), so "Load more" can end early                                                                               | Low    | Documented in the T2 report; UI shows "N loaded" and no total, as the spec says                                                                                                                                                               |
| Existing library, inbox and label tests assume the old query shapes                                                                                                                      | Med    | New args are optional; no-arg behavior is asserted unchanged in T8 and T10. `test-utils/mocks.ts` is extended in the first task that needs each query                                                                                         |
| Inbox flips while the user is looking at it (item disappears when labeled)                                                                                                               | Low    | Intended and reactive; the inspector keeps showing an item opened by `?item` even if it leaves the list                                                                                                                                       |
| Filter bar built by hand drifts from the design system                                                                                                                                   | Low    | T14 checks ReUI `filters`/toggle components and the existing `SegmentedControl` first (reuse, `validate_usage`), then adapts                                                                                                                  |
| Mobile: sidebar search sits inside the sheet, `/` shortcut and focus behavior differ                                                                                                     | Low    | T12 tests desktop and the mobile sheet; T16 manual check at 390px                                                                                                                                                                             |

## Checkpoints

- **After T7:** every writer keeps flags and counters correct; the invariant test is green; `convex-reviewer` pass.
- **After T10:** all read queries done and bounded; review the full backend diff with `code-review-and-quality`.
- **After T15:** the feature works end to end in the app.
- **After T17:** manual verification at 1440px and 390px recorded; `pnpm check` green.

## Open Questions

None. Spec decisions are final; anything new that needs a schema, index, or dependency change stops for a question.
