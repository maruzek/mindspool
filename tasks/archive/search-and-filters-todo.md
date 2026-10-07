# Tasks: search-and-filters

Plan: [plan.md](plan.md). Spec: [SPEC-search-and-filters.md](../SPEC-search-and-filters.md). One task per turn; stop at
checkpoints. Focused tests: `pnpm --filter @mindspool/backend test`, `pnpm --filter @mindspool/web test`. Typecheck:
`pnpm typecheck`. Build: `pnpm build`. Full: `pnpm check`. Schema, indexes and `ownerStats` named in the spec are approved;
anything else (new dependency, extra schema or index) needs a question first. Regenerate `convex/_generated` when function
signatures change.

**Per task:** load the listed `Skills` first. `Sources` are the docs pages the task depends on: you can supply them
(URL, pasted page, or file); if you do not, I fetch them with `convex-docs` and say if the installed version differs.
Always finish with `verification-before-completion` (run the Verify commands, report real output).

## Phase 1: Backend writers

- [x] **T1: Pure rules** (S)
  - New `convex/itemState.ts` with pure functions only: `sourceKindOf(item)` (`x`, `instagram`, `tiktok`, `youtube`,
    `reddit`, `web`, `note`; hosts as in web `BrandIcon`, www/m subdomains handled, malformed URL → `web`),
    `buildSearchText(item)` (title, description, author, siteName, 512 chars of `originalInput`, leading extracted text,
    truncated to 8,000), `buildLinkSearchText(item)` (title, siteName, 512 chars, truncated to 1,000),
    `deriveFlags({ hasIncludedLink, hasUnsureLink, enrichmentPending, labelingPending })` → `{ inbox, needsReview }`.
  - Acceptance:
    - [x] Every host/subdomain in a fixture list maps to the right kind; the same fixture list is asserted in the web
          `BrandIcon` test so the two maps cannot drift.
    - [x] Search text is ordered title-first, never exceeds its cap, and never contains `undefined`.
    - [x] `deriveFlags`: unlabeled, pending enrichment, pending labeling, and unsure each give `inbox`; only unsure gives `needsReview`.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `test-driven-development`, `convex-design`.
  - Files: `convex/itemState.ts`, `convex/itemState.test.ts`, `apps/web/src/library/BrandIcon.test.tsx`

- [x] **T2: Schema, indexes, and search spike** (M, riskiest)
  - Add the optional fields and indexes from the spec to `schema.ts`/`validators.ts`: items (`searchText`, `sourceKind`,
    `needsReview`, `inbox`; `search_text`, `by_owner_source`, `by_owner_review`, `by_owner_inbox`), itemLabels (`sourceKind`,
    `unsure`, `searchText`; `search_link`, `by_owner_label_source`, `by_owner_label_unsure`, `by_owner_item_unsure`), and
    the `ownerStats` table. Spike: a throwaway test that creates items, runs a filtered `withSearchIndex` query with
    `.paginate`, and proves it works under `convex-test`. Record the findings (limits, filter semantics, pagination,
    result cap, anything that differs from the spec) in `docs/verification/search-and-filters.md`.
  - Acceptance:
    - [x] Existing tests pass unchanged (all new fields optional).
    - [x] A filtered, paginated search query returns the expected rows under `convex-test`, or the report says what does not
          work and the task stops for a question.
    - [x] The report lists the real limits from the installed version (indexed terms, results per query, filter fields).
  - Verify: `pnpm --filter @mindspool/backend test`, `pnpm typecheck`, codegen clean.
  - Skills: `convex-docs`, `source-driven-development`, `convex-expert`, `convex-test`.
  - Sources: Convex text search, indexes, pagination, limits, `convex-test` (see plan). Supplying these is most useful here.
  - Files: `convex/schema.ts`, `convex/validators.ts`, `convex/search.spike.test.ts` (deleted or folded into T9),
    `docs/verification/search-and-filters.md`, `convex/_generated/*`

- [x] **T3: `refreshItemState`, stats, create and remove** (M)
  - Add to `itemState.ts`: `refreshItemState(ctx, itemId)` (one included link `.first()`, one unsure link `.first()` via
    `by_owner_item_unsure`, at most 3 recent runs; recompute with `deriveFlags`; patch only on change; apply `ownerStats`
    deltas, creating the row on first use), `adjustStats`, and `linkSearchFields(item)`. Wire `items.create` (sets
    `sourceKind`, `searchText`, flags, `total`+1) and `items.remove` (decrements `total`, `inbox`, `needsReview` as held).
    Idempotent create (same capture key) changes nothing.
  - Acceptance:
    - [x] A new item has `sourceKind`, `searchText`, `inbox: true`; stats show total 1, inbox 1.
    - [x] Repeating create with the same key does not change stats; deleting an item restores the counts.
    - [x] Another owner's stats are never touched.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-design`, `convex-expert`, `test-driven-development`, `convex-test`.
  - Sources: Convex mutations/transactions and OCC notes (docs), only if you want them re-checked.
  - Files: `convex/itemState.ts`, `convex/items.ts`, `convex/itemState.test.ts`, `convex/items.test.ts`

- [x] **T4: Link writers: attach, remove, confirm** (M)
  - `itemLabels.attach` creates or re-includes a link with `sourceKind`, `unsure` (false for manual), `searchText`;
    `remove` (tombstone) clears `unsure`; `confirm` clears `unsure`. Each calls `refreshItemState`. A link restored after
    `exclude` gets fresh fields.
  - Acceptance:
    - [x] Attaching the first label takes the item out of Inbox; removing the last puts it back.
    - [x] Confirming the only unsure label clears `needsReview` and the link's `unsure`; counts follow.
    - [x] An unsure link beyond the fourth is still seen (six links, unsure last).
    - [x] Foreign items/labels are still "Not found"; manual rows are never modified by model paths.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-design`, `test-driven-development`, `convex-test`, `security-and-hardening` (ownership checks).
  - Files: `convex/itemLabels.ts`, `convex/itemState.ts`, `convex/itemLabels.test.ts`, `convex/itemState.test.ts`

- [x] **T5: Decision writers: model links and runs** (M)
  - `decisions.ts`: when a run applies model labels, each new link gets `unsure` (confidence below `UNSURE_THRESHOLD`
    and unconfirmed) and the link search fields; run start/finish and failure refresh the item (pending labeling keeps
    it in Inbox; finishing releases it). Existing manual-wins and no-re-add behavior unchanged.
  - Acceptance:
    - [x] A 60% label is `unsure` and sets `needsReview`; a 90% label does neither.
    - [x] A pending decision run keeps a labeled item in Inbox until it finishes; a failed run releases it.
    - [x] All existing `decisions` tests pass unchanged.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-expert`, `test-driven-development`, `convex-test`.
  - Files: `convex/decisions.ts`, `convex/decisions.test.ts`, `convex/itemState.test.ts`

- [x] **T6: Enrichment writers and link fan-out** (M)
  - `processingRuns.ts`: enrichment start/finish/failure refresh the item (pending enrichment is in Inbox; extracted text
    and title update `searchText`). When the title or text changes, fan out `buildLinkSearchText` to the item's links,
    100 per transaction, with an internal scheduled continuation for the rest.
  - Acceptance:
    - [x] Finishing enrichment with a title makes the item searchable by it and updates its links' `searchText`.
    - [x] An item with 250 links is fully updated across continuations, no transaction touches more than 100 links.
    - [x] A failed enrichment keeps the saved link and the Inbox state sensible (not stuck pending).
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-expert`, `convex-docs` (scheduler), `test-driven-development`, `convex-test`.
  - Sources: Convex scheduled functions docs.
  - Files: `convex/processingRuns.ts`, `convex/itemState.ts`, `convex/processingRuns.test.ts`, `convex/itemState.test.ts`

- [x] **T7: Invariant test and `recountOwnerStats`** (S)
  - Internal `recountOwnerStats` (batched) recomputes flags and the stats row and returns the drift it found. A test runs
    seeded random sequences of create, attach, remove, confirm, decision apply/fail, enrichment finish, delete, with an
    interleaved case, then asserts zero drift and flags equal to a from-scratch recompute.
  - Acceptance:
    - [x] Zero drift after every sequence; deliberately corrupting a flag makes the recount report and repair it.
    - [x] `recountOwnerStats` is idempotent.
  - Verify: `pnpm --filter @mindspool/backend test`, `pnpm typecheck`
  - Skills: `test-driven-development`, `convex-verify`, `debugging-and-error-recovery` if drift appears.
  - Files: `convex/itemState.ts`, `convex/itemState.invariant.test.ts`

### Checkpoint: Writers verified

- [ ] Backend tests and typecheck green; invariant test present. Run `convex-reviewer` on `convex/`. Review with the human before the queries.

## Phase 2: Backend queries

- [x] **T8: `items.list` filters and `items.stats`** (M)
  - Optional `source`, `needsReview`, `inbox` on `items.list`, choosing `by_owner_source`, `by_owner_review`, or
    `by_owner_inbox` (review within inbox uses the review index); no args keeps today's behavior. `items.stats` returns
    `{ total, inbox, needsReview }` from one `ownerStats` document (zeros when absent).
  - Acceptance:
    - [x] Each filter and the combinations in the spec return exactly the matching owner's items, newest first, 10 per page.
    - [x] No-arg `list` output is byte-for-byte unchanged in existing tests.
    - [x] `stats` reads one document and never another owner's.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-design`, `api-and-interface-design`, `convex-test`.
  - Files: `convex/items.ts`, `convex/validators.ts`, `convex/items.test.ts`

- [x] **T9: `items.search`** (S)
  - `items.search({ query, source?, needsReview?, inbox?, paginationOpts })`: trim, 1 to 200 characters else
    `INVALID_INPUT`; `withSearchIndex("search_text")` with `ownerId` always set; relevance order; joined through
    `previewItems`, 10 per page.
  - Acceptance:
    - [x] Finds items by title, note text, and extracted text; another owner's match never appears.
    - [x] Filters combine with the query; blank and over-long queries are rejected.
    - [x] A page reads at most 10 items, 40 links, 30 labels.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-docs`, `source-driven-development`, `convex-expert`, `security-and-hardening`.
  - Sources: Convex text search (supply the page if the T2 report flagged differences).
  - Files: `convex/items.ts`, `convex/validators.ts`, `convex/items.search.test.ts`

- [x] **T10: Label queries: list filters and search** (M)
  - `itemLabels.listItemsForLabel` gains optional `source`, `needsReview` (link `unsure`) using `by_owner_label_source` /
    `by_owner_label_unsure`; new `itemLabels.searchItemsForLabel({ labelId, query, source?, needsReview?, paginationOpts })`
    on `search_link`; items joined through `previewItems`; ownership checked on the label first.
  - Acceptance:
    - [x] A foreign label id is "Not found"; only included (not excluded) links appear.
    - [x] Source, needs-review, and search combine within a label; unfiltered behavior unchanged.
    - [x] Bounds hold: at most 10 links and 10 items per page.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Skills: `convex-design`, `convex-expert`, `convex-test`, `convex-reviewer`.
  - Files: `convex/itemLabels.ts`, `convex/validators.ts`, `convex/itemLabels.test.ts`

### Checkpoint: Backend complete

- [ ] `pnpm check` green; read the whole backend diff with `code-review-and-quality`; confirm `_generated` is committed-ready; review with the human before the web work.

## Phase 3: Web

- [x] **T11: Search params and routes** (S)
  - `apps/web/src/search/searchParams.ts`: normalize `q` (trimmed, blank = unset), `source` (allowed set), `review` (`1`);
    merge helpers that drop `item` when `q`/`source`/`review` change and keep `layout`. Extend `validateLibrarySearch` and
    the `/library`, `/inbox`, `/labels/$labelId` routes. Mount `LibraryView` on `/inbox`.
  - Acceptance:
    - [x] Invalid `source`/`review` fall back to unset with no leaked raw value (router test).
    - [x] `/inbox` renders the library view in inbox mode (placeholder removed).
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm typecheck`
  - Skills: `source-driven-development`, `test-driven-development`, `frontend-ui-engineering`.
  - Sources: TanStack Router search-param validation docs (installed version).
  - Files: `apps/web/src/search/searchParams.ts`, `searchParams.test.ts`, `library/search.ts`, `routes/_app/{library,inbox,labels.$labelId}.tsx`

- [x] **T12: Search box** (M)
  - Enable the sidebar input (remove the "coming soon" tooltip): Enter with non-blank text navigates to `/library?q=`
    (inside a label route it searches that label), blank Enter does nothing, the box mirrors the current `q`, `/` focuses it
    outside text fields, Esc clears. Works in the mobile sheet.
  - Acceptance:
    - [x] Enter, blank Enter, `/`, Esc each tested; `layout` is kept; on a label page the search stays in the label.
    - [x] Accessible name is "Search everything"; no focus trap when `/` is typed inside the capture field.
  - Verify: `pnpm --filter @mindspool/web test`
  - Skills: `frontend-ui-engineering`, `test-driven-development`, ReUI/shadcn tools (`search`, `validate_usage`).
  - Files: `apps/web/src/search/SearchBox.tsx`, `SearchBox.test.tsx`, `shell/AppSidebar.tsx`, `shell/AppShell.test.tsx`

- [x] **T13: LibraryView data, results, Inbox, label scope** (M)
  - `LibraryView` chooses `items.search`/`items.list` or the label equivalents from route and params, with inbox mode and
    the `source`/`review` args. Results heading `Results for “q”` with clear button and a "Search all" action in a label;
    "N loaded" summary; empty states (no results naming active filters with clear actions, "Inbox zero…", empty label).
    Extend `test-utils/mocks.ts` for the new queries.
  - Acceptance:
    - [x] Each route/param combination calls the right query with the right args (tested through mocks).
    - [x] No-results shows the query and each active filter with a working clear; Inbox empty links to Library.
    - [x] Search is announced via `role="status"`; "Load more" still works for search pages.
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm typecheck`
  - Skills: `frontend-ui-engineering`, `incremental-implementation`, `test-driven-development`.
  - Files: `library/LibraryView.tsx`, `library/ItemEmpty.tsx`, `library/LibraryView.test.tsx`, `test-utils/mocks.ts`

- [x] **T14: Filter bar** (M)
  - Source chips (All, X, Instagram, TikTok, YouTube, Reddit, Web, Notes) with brand icons, a divider, and the "Needs review"
    toggle; one-of source semantics, `aria-pressed` on the toggle; updates the URL (replace) and drops `item`. Check ReUI
    `filters`/toggle components and `SegmentedControl` first and reuse. Horizontal scroll contained below 768px.
  - Acceptance:
    - [x] Selecting a chip updates `source`, the toggle updates `review`; both drop `item` and reset pagination.
    - [x] Keyboard operable; selected state matches design section 02; no page-level horizontal scroll at 390px (jsdom-checked classes, manual later).
  - Verify: `pnpm --filter @mindspool/web test`
  - Skills: `frontend-ui-engineering`, ReUI/shadcn MCP (`search`, `get_component`, `get_examples`, `validate_usage`, `get_audit_checklist`).
  - Sources: design project section 02 via DesignSync (already read: chips and toggle), ReUI docs if you want specific components used.
  - Files: `search/FilterBar.tsx`, `search/FilterBar.test.tsx`, `library/LibraryView.tsx`, `library/BrandIcon.tsx` (if a kind→icon helper is needed)

- [x] **T15: Counts: sidebar badge and heading summary** (S)
  - Sidebar Inbox badge from `items.stats` (hidden at 0, "99+" cap); Library heading "N items · M awaiting review" only with
    no search or filter. Stats mock added.
  - Acceptance:
    - [x] Badge hidden at 0 and capped at "99+"; summary shown only on unfiltered Library.
    - [x] Badge count comes from `items.stats`, the same counters the backend invariant test checks against the Inbox list (the mocks are not reactive, so end-to-end agreement is a manual check at the next checkpoint).
  - Verify: `pnpm --filter @mindspool/web test`
  - Skills: `frontend-ui-engineering`, `test-driven-development`.
  - Files: `shell/AppSidebar.tsx`, `shell/nav.ts`, `library/LibraryView.tsx`, tests

### Checkpoint: Feature works end to end

- [ ] Re-seed the dev deployment, then in the real app: search a saved word, filter by source, toggle Needs review, label an Inbox item and watch it leave with the count, filter inside a label. Review with the human.

## Phase 4: Polish and verification

- [x] **T16: Accessibility, keyboard, responsive** (S)
  - Reduced by the owner's decision ("i dont care about accessibility, it is just an app for me right now"): no axe, no
    Lighthouse, no extra focus work. Kept: the keyboard keys are tested and documented in the verification file, and the
    390px layout is a manual check.
  - Acceptance:
    - [x] `/`, Enter, Esc and chip activation are tested (`SearchBox.test.tsx`, `FilterBar.test.tsx`) and documented.
    - [ ] Skipped by decision: axe checks and Lighthouse.
    - [ ] Open (manual, yours): no horizontal page scroll at 390px.
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm build` (both pass)
  - Skills: `frontend-ui-engineering`, `browser-testing-with-devtools`, `verification-before-completion`.
  - Files: new tests plus fixes in the components above

- [x] **T17: Docs, capability map, verification** (S)
  - `docs/verification/search-and-filters.md` (final: spike findings, manual 1440px/390px checks, Lighthouse), update
    `CAPABILITY-MAP-web-redesign.md` status and amend the search-and-filters row, update `docs/core-concepts.md` (search and
    the denormalized flags) and `CAPABILITIES.md` if it lists capabilities.
  - Acceptance:
    - [x] Docs match what shipped (flags, indexes, definitions of Inbox and Needs review); open manual checks are listed, not claimed.
    - [ ] `pnpm check` is green except `format:check` on `.mcp.json`, which was already unformatted before this module (tests, typecheck and build all pass).
  - Verify: `pnpm check`
  - Skills: `documentation-and-adrs`, `verification-before-completion`, `code-review-and-quality`.
  - Files: `docs/verification/search-and-filters.md`, `CAPABILITY-MAP-web-redesign.md`, `docs/core-concepts.md`, `CAPABILITIES.md`

### Checkpoint: Complete

- [ ] All spec success criteria met or listed as open manual checks; ready for review.
