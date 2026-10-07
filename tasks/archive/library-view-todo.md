# Tasks: library-view

Plan: [plan.md](plan.md). Spec: [SPEC-library-view.md](../SPEC-library-view.md). Follow task order and checkpoints; one task
per turn. Focused tests: `pnpm --filter @mindspool/web test`, `pnpm --filter @mindspool/backend test`. Typecheck:
`pnpm --filter @mindspool/web typecheck`. Build: `pnpm --filter @mindspool/web build`. Full: `pnpm check`.
The preview extension (T1) is approved by the spec. New dependencies, schema or index changes, and image upload need a question first.

## Phase 1: Foundations (independent)

- [x] **T1: Backend preview extension** (M)
  - Extend `itemPreview` in `validators.ts` with `enrichmentStatus`, `captureSource`, `originalUrl?`, `labels: {_id, name}[]`
    (max 3) and `labelCount`. Add a shared `previewItems` helper used by `items.list` and `itemLabels.listItemsForLabel`:
    per item one `itemLabels` read via `by_owner_item_decision` (`include`) with `.take(4)`, then at most 3 label gets.
    Clamp both queries to 10 items. Keep preview truncation (160 / 512).
  - Acceptance:
    - [ ] Both queries return the new fields; labels are the owner's included labels only.
    - [ ] One page reads at most 10 items, 40 `itemLabels` rows, 30 label documents.
    - [ ] Foreign items/labels and `exclude` labels never appear; existing preview truncation unchanged.
  - Verify: `pnpm --filter @mindspool/backend test` (new tests: shape, caps, ownership, tombstones, 10-item clamp) and
    `pnpm typecheck`; grep consumers of both queries and fix any broken test or type.
  - Files: `convex/validators.ts`, `convex/items.ts`, `convex/itemLabels.ts`, `convex/items.test.ts`, `convex/itemLabels.test.ts`.

- [x] **T2: Display logic, brand icons, search params** (M)
  - `library/itemDisplay.ts`: `parseCaptureInput` (trimmed `http`/`https` URL, no whitespace, no credentials → url, else
    text; original input never trimmed), `displayTitle` (metadata title, else host+path, else first non-empty line),
    `hostOf`, `kindOf`, `relativeDate(now)` ("4m", "2h", "3d", then short date) with an injectable clock.
    `library/BrandIcon.tsx` maps hosts (`x.com`/`twitter.com`, `instagram.com`, `tiktok.com`, `youtube.com`/`youtu.be`,
    `reddit.com`/`redd.it`) to the SVGs in `assets/brands/` rendered with `currentColor`, else Globe; notes get a note
    icon. `library/search.ts`: `validateSearch` for `layout` (`list`|`grid`, default `list`) and `item`.
  - Acceptance:
    - [ ] Pure functions covered: credentials/spaces/scheme cases, titles, hosts, kinds, fixed-clock dates.
    - [ ] Unknown `layout` falls back to `list`; `item` passes through.
    - [ ] BrandIcon renders `currentColor` (no hex).
  - Verify: `pnpm --filter @mindspool/web test`, `typecheck`, `build`.
  - Files: `library/itemDisplay.ts`, `library/itemDisplay.test.ts`, `library/BrandIcon.tsx`, `library/search.ts`, test; Vite/SVG config if needed.

- [x] **T3: Capture bar and owed draft regressions** (M)
  - First write the owed regression tests against the existing draft hook and make them green: draft survives a failed save
    and an auth interruption; retry reuses the key; whitespace preserved verbatim; an older save finishing does not erase
    newer input; success clears draft and storage. Then reconcile `inputType` in `captureDraft.ts` with save-time detection
    (T2) without weakening those tests. Build `CaptureBar.tsx`: auto-growing textarea, Save enabled for non-blank input,
    Enter saves and Shift+Enter inserts a newline, `captureKey = crypto.randomUUID()` on first attempt, `items.create` with
    `captureSource: "web"`, editing clears the key, focus returns after success, polite `role="status"` "Saved", failure in
    `role="alert"` via `errorMessage` with input kept, inline message past 8,192 (URL) or 100,000 (text) characters.
  - Acceptance:
    - [ ] A failed then retried save creates one item (same key sent twice).
    - [ ] A multi-line note is sent verbatim; limits block sending with an inline message.
    - [ ] Capture feedback is announced; Save is disabled for blank input.
  - Verify: `pnpm --filter @mindspool/web test`, `typecheck`, `build`.
  - Files: `capture/captureDraft.ts` and tests, `library/CaptureBar.tsx`, `library/CaptureBar.test.tsx`.
  - Depends on: T2 (URL detection).

- [x] **T4: Adapt row, card, thumb, tag, status components** (M)
  - Tighten `ItemRow`, `ItemCard`, `ItemThumb` (hatched tonal tile + kind icon, no external images), `LabelTag`,
    `SegmentedControl`, `ProcessingStatus` in `packages/ui/src/components/mindspool/` to the spec's props (render prop for
    links, `selected`, 2px divider and accent inset bar, processing lines: `not_started` "Saved — original stored",
    `pending` "Processing…", `failed` "Extraction failed — link kept", `succeeded` none). Tokens only, zero radius.
  - Acceptance:
    - [ ] Components render from props only (no Convex or router imports); `selected` sets `aria-current`.
    - [ ] No raw hex; ui package typechecks.
  - Verify: `pnpm typecheck`, component tests, `pnpm --filter @mindspool/web build`.
  - Files: `packages/ui/src/components/mindspool/{item-row,item-card,item-thumb,label-tag,segmented-control,processing-status}.tsx`, tests.

### Checkpoint: Foundations

- [ ] `pnpm check` green; capture saves a link and a note against dev Convex; backend preview bounded; display components
      compile. Review with human.

## Phase 2: Browse

- [x] **T5: Library list on both routes, with pagination** (M)
  - `LibraryView.tsx` (heading, capture bar, list, "Load more") taking `{ source: "all" | { labelId } }`; `ItemList.tsx`
    maps a page through `itemDisplay` into `ItemRow` with `SourceLine`, tags (max 3 plus `+N`), processing line and date.
    Mount in `routes/_app/library.tsx` (`items.list`) and `routes/_app/labels.$labelId.tsx`
    (`itemLabels.listItemsForLabel`, heading = label name, unknown label keeps the shell's Not found). Number of loaded
    items shown only when more than zero. "Load more" uses `usePaginatedQuery` with 10 per page, announced while loading.
  - Acceptance:
    - [ ] A saved item appears first with the right title and processing line.
    - [ ] Pages load 10 at a time with no duplicates; label view shows only its items.
    - [ ] Rows keyed by `_id`; dates use the injected clock.
  - Verify: tests with mocked pages (rows, tag overflow, processing lines, load more, label variant); `typecheck`, `build`.
  - Files: `library/{LibraryView,ItemList}.tsx`, `routes/_app/library.tsx`, `routes/_app/labels.$labelId.tsx`, tests.
  - Depends on: T1, T2, T3, T4.

- [x] **T6: Grid and layout toggle** (S)
  - `ItemGrid.tsx` (3 columns from 1280px, 2 from 768px, 1 below) with cards (tile, source line, title, tags);
    `SegmentedControl` in `LibraryView` writes `?layout=` via the router.
  - Acceptance:
    - [ ] Toggle updates the URL, survives reload and back/forward; invalid value shows list.
    - [ ] Grid and list use the same data and pagination.
  - Verify: tests (toggle updates URL, grid renders cards); manual at 1440px and 390px.
  - Files: `library/ItemGrid.tsx`, `library/LibraryView.tsx`, tests.
  - Depends on: T5.

### Checkpoint: Browse

- [ ] `/library` and `/labels/<id>` show list and grid with load more against dev Convex. Review with human.

## Phase 3: States, selection, close

- [x] **T7: Loading, empty, error states and responsive layout** (S)
  - `ItemEmpty.tsx`: "Your library starts here." with the paste prompt; empty label explains items are added from an
    item's labels; skeleton rows while loading; errors reach the shell boundary. Below 768px hide the tags column in rows
    and stack the capture bar above the layout toggle.
  - Acceptance:
    - [ ] Loading, empty library, empty label, error each have distinct visible text.
    - [ ] 390px has no horizontal scroll.
  - Verify: tests for each state; manual at 390px.
  - Files: `library/ItemEmpty.tsx`, `library/LibraryView.tsx`, `ItemList.tsx`, tests.
  - Depends on: T5.

- [x] **T8: Selection through the URL and keyboard operation** (S)
  - Rows and cards are links to `?item=<id>` keeping `layout`; `aria-current` on the selected one; reserve the 380px right
    column, hidden until `item-inspector` mounts. An `item` id not on a loaded page still renders without a highlight.
  - Acceptance:
    - [ ] Click and keyboard (Tab, Enter) set `?item`; reload and back/forward restore it.
    - [ ] After saving, the new item is highlighted, not opened.
  - Verify: tests for selection, `aria-current`, unknown id; manual keyboard pass.
  - Files: `library/ItemList.tsx`, `ItemGrid.tsx`, `LibraryView.tsx`, tests.
  - Depends on: T5.

- [x] **T9: Cleanup, verification record, docs** (S) — manual checks pending (see docs/verification/library-view.md)
  - Remove unused `packages/ui` mindspool components after grepping imports (keep `source-chip` and `search-input` for
    `search-and-filters` and note it); write `docs/verification/library-view.md` (commands, 1440px/390px comparison with
    design section 02, axe and Lighthouse results, load-more and duplicate-free paging check, capture failure/retry run);
    update `README.md`/`docs/core-concepts.md` (preview fields, routes) and the capability-map status.
  - Acceptance: every spec success criterion checked with evidence; no test dropped without replacement.
  - Verify: `pnpm check` and a manual run.
  - Depends on: T1–T8.

### Checkpoint: Complete

- [ ] All SPEC-library-view success criteria met; human review; then write `SPEC-item-inspector.md`.
