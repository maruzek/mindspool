# Tasks: Label board views

Status: **Draft for review. No implementation tasks are complete.**

Source: [SPEC-boards.md](../SPEC-boards.md). Architecture and risks: [plan.md](plan.md).
Previous Reddit tasks remain in [archive/reddit-clipping-todo.md](archive/reddit-clipping-todo.md), including unfinished checks.

Execute the numbered order by default. Task dependencies are explicit below. Each task leaves existing apps working. Do not start until the plan is reviewed; approval of a plan is not evidence that tasks pass.

Tasks list no more than five likely feature files. If generated outputs or a repair would exceed that scope, split the task before editing; generated files are regenerated, never manually edited. Only checkpoints repeat full builds; focused tests/typechecks verify individual slices. All commands below run from the repository root.

## Task 1: Record the design and settle proposed defaults

**Description:** Extract the relevant measurements from the local Claude export into a tracked board reference, and reconcile the proposed defaults in the spec with the approved plan.

**Acceptance criteria:**

- [ ] Board reference records rail/grid/tools/tray/card styling and distinguishes agreed behavior from illustrative export content.
- [ ] Spec records reviewed geometry/search/history/connection/performance defaults and the operation-receipt and membership-invalidation technical contracts.
- [ ] Independent boards, virtual-label semantics, frames, text editing, and provisional column deletion are explicitly preserved at their agreed scope.

**Verification:**

- [ ] `pnpm exec prettier --check SPEC-boards.md docs/design/boards.md`
- [ ] Compare recorded values with the local export; confirm git check-ignore deisgn.html succeeds.

**Dependencies:** None.

**Files likely touched:**

- `SPEC-boards.md`
- `docs/design/boards.md`

**Estimated scope:** Small: 2 files.

## Task 2: Define owned board storage and opening

**Description:** Introduce minimal indexed board contracts and owned lazy-open/read operations, including stable keys, layout revisions, and validation bounds. Keep future element variants in validators but introduce their mutation behavior only in later slices.

**Acceptance criteria:**

- [ ] Authenticated owner can lazily open one empty board per existing label; anonymous/foreign/missing-label calls fail without leaking identity.
- [ ] Storage has reviewed element/connection/receipt indexes and finite geometry, type, text, and batch validation; concurrent opens cannot duplicate the board.
- [ ] Layout reads are bounded and expose revision/cursor metadata for coherent frontend assembly; initial open places no items.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boards.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`
- [ ] Exercise repeated open, foreign label, invalid geometry, and more-than-one-page reads with convex-test; codegen output is handled by Task 3.

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/backend/convex/schema.ts`
- `packages/backend/convex/boardValidators.ts`
- `packages/backend/convex/boards.ts`
- `packages/backend/convex/boards.test.ts`

**Estimated scope:** Medium: 4 files.

## Task 3: Prepare generated contracts and React Flow

**Description:** Regenerate board types through the installed Convex tooling on the classified development target, and add an exact React-19-compatible stable @xyflow/react version to the web workspace.

**Acceptance criteria:**

- [ ] Installed package compatibility and license are verified from primary documentation/package metadata; no paid Pro dependency is introduced.
- [ ] Convex definitions are regenerated rather than hand-edited; regeneration uses the established classified development target, not a new/rebound project.
- [ ] Dependency and generated-type changes leave backend/web typechecks and the existing web build working.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend codegen` (after development-target verification)
- [ ] `pnpm --filter @mindspool/backend typecheck`
- [ ] `pnpm --filter @mindspool/web typecheck`
- [ ] `pnpm --filter @mindspool/web build`

**Dependencies:** Task 2.

**Files likely touched:**

- `apps/web/package.json`
- `pnpm-lock.yaml`
- `packages/backend/convex/_generated/api.d.ts`
- `packages/backend/convex/_generated/dataModel.d.ts`

**Estimated scope:** Medium: 4 files.

### Checkpoint: After Tasks 1–3

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.

## Task 4: Open the empty label Board view

**Description:** Add label-specific board URL validation and mount the authenticated board page with complete-layout loading, empty state, and persisted metadata.

**Acceptance criteria:**

- [ ] layout=board is valid on a label route, while Library/Inbox retain List/Grid validation and malformed layouts fall back safely.
- [ ] BoardView opens the actual owned board, waits for coherent layout pages, and exposes loading/not-found/retry rather than rendering a partial board.
- [ ] Direct URL, reload, and browser back/forward work without auto-placing the label's items; narrow screens offer List/Grid.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/search/searchParams.test.ts src/boards/BoardView.test.tsx`
- [ ] `pnpm --filter @mindspool/web typecheck`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: open a label with existing items using layout=board; confirm canvas remains empty.

**Dependencies:** Task 3.

**Files likely touched:**

- `apps/web/src/search/searchParams.ts`
- `apps/web/src/search/searchParams.test.ts`
- `apps/web/src/routes/_app/labels.$labelId.tsx`
- `apps/web/src/boards/BoardView.tsx`
- `apps/web/src/boards/BoardView.test.tsx`

**Estimated scope:** Medium: 5 files.

## Task 5: Switch label layouts with the proper frame

**Description:** Expose the Board option alongside List/Grid and conditionally reuse the rail frame on the same label route. Keep the ordinary library renderer restricted to its supported layouts.

**Acceptance criteria:**

- [ ] Label List/Grid exposes Board; switching retains the public label route and relevant validated search state.
- [ ] Only a label's Board view uses the 60px rail/full-bleed frame; returning restores the normal sidebar with one main region and unchanged authentication.
- [ ] Library/Inbox layout controls and inspector behavior regressions pass; board navigation indicates the active canvas correctly.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/shell/AppShell.test.tsx src/library/LibraryView.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: List → Board → Grid and back/forward; inspect frame, rail highlight, and nested main/provider structure.

**Dependencies:** Task 4.

**Files likely touched:**

- `apps/web/src/shell/AppShell.tsx`
- `apps/web/src/shell/AppShell.test.tsx`
- `apps/web/src/shell/IconRail.tsx`
- `apps/web/src/library/LibraryView.tsx`
- `apps/web/src/library/LibraryView.test.tsx`

**Estimated scope:** Medium: 5 files.

## Task 6: Share transactional library writers

**Description:** Extract callable transaction helpers for capture and label decisions before any board write relies on them. Preserve the existing capture contract and item-state maintenance.

**Acceptance criteria:**

- [ ] Public capture and membership mutations retain input validation, retry identity, manual/model attribution, search projections, and owner counter behavior.
- [ ] Shared helpers support note creation and manual inclusion inside a board mutation without calling another public mutation.
- [ ] Existing web/extension capture, Reddit capture, labeling, and item-state regression tests remain passing.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/items.test.ts convex/redditCapture.test.ts convex/itemLabels.test.ts convex/itemState.test.ts convex/decisions.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 2.

**Files likely touched:**

- `packages/backend/convex/items.ts`
- `packages/backend/convex/itemLabels.ts`
- `packages/backend/convex/libraryWriters.ts`
- `packages/backend/convex/libraryWriters.test.ts`

**Estimated scope:** Medium: 4 files.

### Checkpoint: After Tasks 4–6

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.

## Task 7: Place items atomically on their label board

**Description:** Introduce placement/removal mutations with receipt identity, expected revisions, and the shared manual inclusion helper. This API is not exposed through interactive drag until lifecycle cleanup passes.

**Acceptance criteria:**

- [ ] Placing an owned outside item includes the board label and creates one placement atomically; already-included membership retains attribution.
- [ ] Retries and concurrent placement attempts cannot duplicate a placement; conflicting payloads or stale revisions are rejected predictably.
- [ ] Removing placement preserves item/membership, rejects foreign references, and advances the layout revision only for effective changes.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boards.test.ts convex/boardOperations.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`
- [ ] Assert a failed placement writes neither membership nor placement, and an ambiguous acknowledged retry returns the recorded result.

**Dependencies:** Task 6.

**Files likely touched:**

- `packages/backend/convex/boards.ts`
- `packages/backend/convex/boards.test.ts`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`

**Estimated scope:** Medium: 4 files.

## Task 8: Invalidate placements on membership removal

**Description:** Wire label exclusion into board invalidation and bounded cleanup, using the reviewed generation/transaction marker so reassigning a label cannot revive a stale card.

**Acceptance criteria:**

- [ ] Manual exclusion immediately hides/rejects the affected placement and incident connections; assigning that label again leaves the item unplaced.
- [ ] Remove/re-add before asynchronous cleanup cannot restore old geometry or allow stale saves/history to resurrect it.
- [ ] Current model completion preserves manual decisions; all current membership writers are inventoried and future exclusion paths share the invalidation helper.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardState.test.ts convex/itemLabels.test.ts convex/decisions.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 7.

**Files likely touched:**

- `packages/backend/convex/boardState.ts`
- `packages/backend/convex/boardState.test.ts`
- `packages/backend/convex/itemLabels.ts`
- `packages/backend/convex/itemLabels.test.ts`
- `packages/backend/convex/decisions.test.ts`

**Estimated scope:** Medium: 5 files.

## Task 9: Clean boards when a library item is deleted

**Description:** Extend the existing bounded item-deletion continuation to remove board references across all label boards, without disrupting label/run cleanup.

**Acceptance criteria:**

- [ ] Deleting the owned item immediately makes all placements unreadable and stale operations invalid.
- [ ] Indexed continuation removes all placements/incident connections in bounded batches and preserves existing storage/link/run cleanup.
- [ ] Deleting content never retains a preview snapshot; partial cleanup and repeated continuations cannot lose unrelated board records.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/items.test.ts convex/boardState.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`
- [ ] Seed more affected boards than one cleanup batch and drain scheduled functions; assert complete cleanup and intact unrelated cards.

**Dependencies:** Task 8.

**Files likely touched:**

- `packages/backend/convex/items.ts`
- `packages/backend/convex/items.test.ts`
- `packages/backend/convex/boardState.ts`
- `packages/backend/convex/boardState.test.ts`

**Estimated scope:** Medium: 4 files.

### Checkpoint: After Tasks 7–9

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.

## Task 10: Return bounded board card previews

**Description:** Provide the owner-scoped media/text projection required by the board and tray, separate from full inspector content.

**Acceptance criteria:**

- [ ] Placed-item batches verify board ownership, item ownership, and current membership and return only bounded title/body/source/label/media data.
- [ ] First external/stored image or poster resolves correctly; missing/deleted media has an explicit fallback and full saved text is not copied into board records.
- [ ] Preview reads preserve byte/document limits and can be refreshed without resetting placement geometry.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardPreviews.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 9.

**Files likely touched:**

- `packages/backend/convex/boardPreviews.ts`
- `packages/backend/convex/boardPreviews.test.ts`
- `packages/backend/convex/boardValidators.ts`

**Estimated scope:** Medium: 3 files.

## Task 11: Browse the tray in saved-item order

**Description:** Introduce bounded tray browse/search queries using chronological owner-item candidate pages and indexed membership checks; preserve cursors through transformed pages.

**Acceptance criteria:**

- [ ] Newest/Oldest uses item creation time even when an older item is newly assigned a label; All-library/current-label scope and filters are correct.
- [ ] Search uses the approved relevance order and current source/review semantics; current-label review checks the matching link.
- [ ] Sparse/empty intermediate pages retain continuation and split metadata; owner isolation and byte/row bounds hold without a mandatory existing-data backfill.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardTray.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`
- [ ] Test an old item assigned today, sparse labels, empty nonterminal pages, selected-label All-library searches, and changing reactive page sizes.

**Dependencies:** Task 10.

**Files likely touched:**

- `packages/backend/convex/boardTray.ts`
- `packages/backend/convex/boardTray.test.ts`
- `packages/backend/convex/boardValidators.ts`

**Estimated scope:** Medium: 3 files.

## Task 12: Show the searchable bottom tray

**Description:** Deliver the collapsible, adjustable-height tray with paginated previews and explicit scope/filter/sort controls, styled from the tracked design reference.

**Acceptance criteria:**

- [ ] Tray defaults to Current label and Newest; All library exposes the optional label filter, source/review filters, and search; clearing search restores chronological sort.
- [ ] Collapse/height preferences are local per board; empty-board first use opens the tray and displays clear instructions/loading/retry/load-more states.
- [ ] Placed items remain discoverable and show On this board/Locate; filters never remove existing canvas placements, and sparse pages are not mislabeled exhausted.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/LibraryTray.test.tsx src/boards/useBoardTray.test.ts`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: resize/collapse tray, search, change scope, and fetch another page without moving canvas content.

**Dependencies:** Task 5, Task 11.

**Files likely touched:**

- `apps/web/src/boards/LibraryTray.tsx`
- `apps/web/src/boards/LibraryTray.test.tsx`
- `apps/web/src/boards/useBoardTray.ts`
- `apps/web/src/boards/useBoardTray.test.ts`
- `apps/web/src/boards/BoardView.tsx`

**Estimated scope:** Medium: 5 files.

### Checkpoint: After Tasks 10–12

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.
- [ ] Exercise the current usable board path in an available desktop browser and record authenticated versus mocked coverage.

## Task 13: Drag a real item onto the canvas

**Description:** Wire the first complete place-and-reopen path using the reviewed API, bounded preview, React Flow coordinate conversion, and duplicate-placement indicators.

**Acceptance criteria:**

- [ ] Tray drag/drop and Add to board create a real placement at the previewed location under arbitrary pan/zoom; cancel/outside drops have no effect.
- [ ] An outside item gains the current label only on successful placement; a placed item is located rather than duplicated.
- [ ] Reload shows the same placement and media/text preview; library/label removal removes the visible card through the completed lifecycle contract.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/BoardCanvas.test.tsx src/boards/BoardView.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Authenticated desktop browser: search an outside item, drop at nondefault zoom, reopen, remove membership, and confirm the card disappears.

**Dependencies:** Task 7, Task 8, Task 9, Task 10, Task 12.

**Files likely touched:**

- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardCanvas.test.tsx`
- `apps/web/src/boards/BoardView.tsx`
- `apps/web/src/boards/BoardView.test.tsx`
- `apps/web/src/boards/LibraryTray.tsx`

**Estimated scope:** Medium: 5 files.

## Task 14: Persist completed move operations safely

**Description:** Expand the operation API to persist item geometry changes and robust receipt handling before introducing optimistic client sequencing.

**Acceptance criteria:**

- [ ] One completed drag persists one validated move; pointer ticks perform no writes and invalid batches are all-or-nothing.
- [ ] Expected revision prevents stale-session overwrites; same operation retry returns its acknowledgment and key reuse with a new payload fails.
- [ ] Receipt lookup/cleanup is indexed and bounded; expired/stale operations require resynchronization instead of duplicating effects.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardOperations.test.ts convex/boards.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 13.

**Files likely touched:**

- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`
- `packages/backend/convex/boards.ts`
- `packages/backend/convex/boardValidators.ts`

**Estimated scope:** Medium: 4 files.

## Task 15: Autosave through an acknowledged board session

**Description:** Introduce the serialized optimistic operation queue and visible save status, wiring canvas drag-stop into it without overriding pending changes from reactive updates.

**Acceptance criteria:**

- [ ] Local moves render immediately while Saving/Saved tracks server acknowledgment; stale reactive echoes cannot erase pending edits.
- [ ] Ambiguous failures retry the same identity/payload; failed writes stop dependent mutations while retaining the draft and providing Retry.
- [ ] Revision conflicts keep the draft until explicit Reload latest; offline/retry/navigation guards behave honestly without claiming durable offline recovery.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/boardSession.test.ts src/boards/BoardView.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: move/reload; simulate lost acknowledgment/network failure; open the same board in two owner sessions and confirm a visible conflict.

**Dependencies:** Task 14.

**Files likely touched:**

- `apps/web/src/boards/boardSession.ts`
- `apps/web/src/boards/boardSession.test.ts`
- `apps/web/src/boards/useBoardSession.ts`
- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardView.tsx`

**Estimated scope:** Medium: 5 files.

### Checkpoint: After Tasks 13–15

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.
- [ ] Exercise the current usable board path in an available desktop browser and record authenticated versus mocked coverage.

## Task 16: Restore pan and zoom

**Description:** Persist viewport independently of layout history and provide Pan/Select, temporary Space pan, trackpad navigation, zoom controls, and Fit to content.

**Acceptance criteria:**

- [ ] Reopening restores the last acknowledged pan/zoom; viewport updates do not invalidate layout revisions or create undo entries.
- [ ] Zoom controls/range and mouse/trackpad tools follow reviewed defaults without intercepting shortcuts inside inputs.
- [ ] Canvas controls remain clear of tray/inspector and do not scale with the canvas; pending viewport writes have accurate error handling.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/BoardControls.test.tsx`
- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boards.test.ts`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Real desktop: Space pan, trackpad pan/pinch, Fit, percent controls, reopen at saved viewport.

**Dependencies:** Task 15.

**Files likely touched:**

- `packages/backend/convex/boards.ts`
- `packages/backend/convex/boards.test.ts`
- `apps/web/src/boards/BoardControls.tsx`
- `apps/web/src/boards/BoardControls.test.tsx`
- `apps/web/src/boards/BoardCanvas.tsx`

**Estimated scope:** Medium: 5 files.

## Task 17: Persist resizable card display geometry

**Description:** Introduce tested region geometry and display-mode changes, integrated through the existing operation pipeline.

**Acceptance criteria:**

- [ ] Default text region matches with/without media; combined/image/text mode switches retain region geometry and enforce reviewed minimum dimensions.
- [ ] Independent width/height resizing and proportional combined-region changes persist once per completed interaction.
- [ ] Backend rejects nonfinite/invalid geometry or unsupported modes without changing content or partially applying updates.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/cardGeometry.test.ts`
- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardOperations.test.ts`
- [ ] `pnpm --filter @mindspool/web typecheck`

**Dependencies:** Task 16.

**Files likely touched:**

- `apps/web/src/boards/cardGeometry.ts`
- `apps/web/src/boards/cardGeometry.test.ts`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`
- `packages/backend/convex/boardValidators.ts`

**Estimated scope:** Medium: 5 files.

## Task 18: Render card media and open the inspector

**Description:** Deliver styled custom item cards with truncation, missing-media fallbacks, resize controls, display menu, and the existing item-inspector interaction.

**Acceptance criteria:**

- [ ] Cards show the first attached image above truncated text, keep original data untouched, and apply saved modes/geometry with restrained fallback states.
- [ ] Single-click selects and double-click/Open details opens the existing inspector using item URL state; tray filters do not accidentally close selected placed-item details.
- [ ] Selection toolbar/handles follow the Claude reference; no note edit/style control appears; inspector overlay does not move persisted cards.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/ItemCardNode.test.tsx src/boards/BoardView.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: resize mixed/no-image cards, change modes, open full text in inspector, and reload.

**Dependencies:** Task 10, Task 17.

**Files likely touched:**

- `apps/web/src/boards/ItemCardNode.tsx`
- `apps/web/src/boards/ItemCardNode.test.tsx`
- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardView.tsx`
- `apps/web/src/boards/BoardView.test.tsx`

**Estimated scope:** Medium: 5 files.

### Checkpoint: After Tasks 16–18

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.
- [ ] Exercise the current usable board path in an available desktop browser and record authenticated versus mocked coverage.

## Task 19: Create a note and its placement atomically

**Description:** Introduce the board note-creation transaction using shared capture/membership helpers and receipt identity.

**Acceptance criteria:**

- [ ] Create saves exactly one plain-text library item, manually includes the current label, and creates its placement in one transaction.
- [ ] Nonblank validation, 100,000-character limit, original whitespace, capture idempotency, and URL-looking text-as-note behavior are preserved.
- [ ] Retries start no duplicate labeling run and preserve counters/search state; failures create no partial note/assignment/placement.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boards.test.ts convex/libraryWriters.test.ts convex/itemState.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 6, Task 15.

**Files likely touched:**

- `packages/backend/convex/boards.ts`
- `packages/backend/convex/boards.test.ts`
- `packages/backend/convex/libraryWriters.ts`
- `packages/backend/convex/libraryWriters.test.ts`

**Estimated scope:** Medium: 4 files.

## Task 20: Create notes from a dialog

**Description:** Expose New note and preserve its draft while the atomic transaction is pending or retrying.

**Acceptance criteria:**

- [ ] Dialog creates plain-text notes at visible canvas center, has explicit Create/Cancel, and displays backend validation/network errors without losing input.
- [ ] Created note is visible on the board and in the library with the current label; cancellation creates nothing and retries do not duplicate it.
- [ ] No URL/scraping, inline edit, or formatting control is exposed; later undo will remove only its placement.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/NewNoteDialog.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Authenticated browser: create whitespace-preserving and URL-looking notes; verify library/label membership and retry.

**Dependencies:** Task 18, Task 19.

**Files likely touched:**

- `apps/web/src/boards/NewNoteDialog.tsx`
- `apps/web/src/boards/NewNoteDialog.test.tsx`
- `apps/web/src/boards/BoardControls.tsx`
- `apps/web/src/boards/BoardView.tsx`

**Estimated scope:** Medium: 4 files.

## Task 21: Define persisted ordered columns

**Description:** Add column create/title/width, child ordering and attach/detach operations with pure coordinate/layout helpers.

**Acceptance criteria:**

- [ ] Column operations validate same-board item children, reject nesting/cycles, and compute ordered vertical stacks without changing labels.
- [ ] Column width determines child width while preserving independently resizable region heights; attach/remap remembers free-standing size.
- [ ] Detach produces a valid canvas position and restored dimensions, and stale/oversized operations are atomically rejected.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/columnLayout.test.ts`
- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardOperations.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 18, Task 20.

**Files likely touched:**

- `apps/web/src/boards/columnLayout.ts`
- `apps/web/src/boards/columnLayout.test.ts`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`
- `packages/backend/convex/boardValidators.ts`

**Estimated scope:** Medium: 5 files.

### Checkpoint: After Tasks 19–21

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.
- [ ] Exercise the current usable board path in an available desktop browser and record authenticated versus mocked coverage.

## Task 22: Organize cards in interactive columns

**Description:** Render titled columns and connect drag/drop/reorder/width controls to the complete operation/session pipeline.

**Acceptance criteria:**

- [ ] User creates/renames/resizes a column and drags tray or canvas cards into the indicated stack position; children never overlap.
- [ ] Column moves carry cards once, between-column moves preserve remembered dimensions, and dragging out restores free-standing size.
- [ ] Cards created directly in a column use default free-standing restoration size; note dialog can target a column and layout survives reload.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/ColumnNode.test.tsx src/boards/BoardCanvas.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser at nondefault zoom: reorder, move between columns, resize column/card, create note in column, detach, and reload.

**Dependencies:** Task 21.

**Files likely touched:**

- `apps/web/src/boards/ColumnNode.tsx`
- `apps/web/src/boards/ColumnNode.test.tsx`
- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardCanvas.test.tsx`
- `apps/web/src/boards/NewNoteDialog.tsx`

**Estimated scope:** Medium: 5 files.

## Task 23: Preserve cards when a column is deleted

**Description:** Implement the provisional deletion contract with reusable before/after state suitable for later undo restoration.

**Acceptance criteria:**

- [ ] Deleting only a column leaves cards at computed canvas positions and current displayed dimensions; no label/content changes occur.
- [ ] Existing connections survive container deletion and later history restoration has the column title/order/geometry needed to undo exactly.
- [ ] Tests distinguish deleting the container alone from explicitly removing selected children; spec retains the later-revision flag.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/columnLayout.test.ts src/boards/ColumnNode.test.tsx`
- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardOperations.test.ts`
- [ ] `pnpm --filter @mindspool/web build`

**Dependencies:** Task 22.

**Files likely touched:**

- `apps/web/src/boards/columnLayout.ts`
- `apps/web/src/boards/columnLayout.test.ts`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`
- `apps/web/src/boards/ColumnNode.tsx`

**Estimated scope:** Medium: 5 files.

## Task 24: Add board-only headings

**Description:** Provide persisted headings with fixed design typography and a small create/rename control, distinct from saved note editing.

**Acceptance criteria:**

- [ ] Create/rename/move/remove heading persists organization only and never creates or modifies a library item.
- [ ] Text is validated and rendered as text; heading typography follows the tracked design and no arbitrary rich formatting is exposed.
- [ ] Heading operations participate in the session revision/save pipeline and expose state later usable by history.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/HeadingNode.test.tsx`
- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardOperations.test.ts`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: create a heading, rename/move it, and reopen.

**Dependencies:** Task 23.

**Files likely touched:**

- `apps/web/src/boards/HeadingNode.tsx`
- `apps/web/src/boards/HeadingNode.test.tsx`
- `apps/web/src/boards/BoardCanvas.tsx`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`

**Estimated scope:** Medium: 5 files.

### Checkpoint: After Tasks 22–24

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.
- [ ] Exercise the current usable board path in an available desktop browser and record authenticated versus mocked coverage.

## Task 25: Persist card connections

**Description:** Add owned connection creation/edit/removal with duplicate/self/foreign-endpoint rejection and incident-edge lifecycle cleanup.

**Acceptance criteria:**

- [ ] Connections reference eligible item placements on the same board; only one unordered-pair connection is allowed and self links are rejected.
- [ ] Arrowheads, bounded plain-text label, and palette color persist through revisioned operations; no global relationship is created.
- [ ] Placement deletion, membership invalidation, and item cleanup remove incident edges while column deletion preserves them.

**Verification:**

- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardConnections.test.ts convex/boardState.test.ts`
- [ ] `pnpm --filter @mindspool/backend typecheck`

**Dependencies:** Task 8, Task 9, Task 23.

**Files likely touched:**

- `packages/backend/convex/boardConnections.ts`
- `packages/backend/convex/boardConnections.test.ts`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardState.ts`
- `packages/backend/convex/boardState.test.ts`

**Estimated scope:** Medium: 5 files.

## Task 26: Draw and edit connections on the canvas

**Description:** Expose Connect mode, temporary attachment points, curved paths, and compact edge controls using the reviewed connection API.

**Acceptance criteria:**

- [ ] User connects two cards and changes None/End/Both arrows, label, or palette color; invalid endpoints and duplicates give clear feedback.
- [ ] Edges render beneath cards and follow movement/resizing/reorder/detach; controls do not expose permanent flowchart ports.
- [ ] Edges and settings survive reload and use real save/error status; no network-graph side effect occurs.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/ConnectionEdge.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: connect cards in/outside columns, move/resize endpoints, and verify persistence at several zoom levels.

**Dependencies:** Task 24, Task 25.

**Files likely touched:**

- `apps/web/src/boards/ConnectionEdge.tsx`
- `apps/web/src/boards/ConnectionEdge.test.tsx`
- `apps/web/src/boards/ConnectionControls.tsx`
- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardControls.tsx`

**Estimated scope:** Medium: 5 files.

## Task 27: Move and remove multi-selections

**Description:** Add marquee/Shift-click/focused Select all with pure deduplicated group operation construction and explicit remove semantics.

**Acceptance criteria:**

- [ ] Selection supports cards/columns/headings/connections without intercepting inputs; Escape clears or cancels interaction.
- [ ] Group move includes selected column children once; one completion creates one atomic operation; removing container alone preserves unselected children.
- [ ] Canvas Delete removes organization only and incident edges as appropriate, with no item or membership deletion.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/boardSelection.test.ts src/boards/BoardCanvas.test.tsx`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Real browser: select a column and its child, move once, then compare container-only and explicit child removal.

**Dependencies:** Task 23, Task 24, Task 26.

**Files likely touched:**

- `apps/web/src/boards/boardSelection.ts`
- `apps/web/src/boards/boardSelection.test.ts`
- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardCanvas.test.tsx`

**Estimated scope:** Medium: 4 files.

### Checkpoint: After Tasks 25–27

- [ ] The completed slice meets its task criteria with focused test evidence; review concrete behavior and unresolved risks before continuing.
- [ ] `pnpm --filter @mindspool/backend test` and `pnpm --filter @mindspool/web test` pass.
- [ ] `pnpm --filter @mindspool/backend typecheck`, `pnpm --filter @mindspool/web typecheck`, and `pnpm --filter @mindspool/web build` pass.
- [ ] Exercise the current usable board path in an available desktop browser and record authenticated versus mocked coverage.

## Task 28: Model board-only undo and redo

**Description:** Implement bounded session history with logical action grouping and inverse operations. Extend server layout replay to restore stable keys only while ownership and current membership remain valid, before attaching keyboard controls.

**Acceptance criteria:**

- [ ] One placement/move/resize/group/column/heading/edge action is one history entry; viewport/filters/selection are excluded and new edits clear redo.
- [ ] Inverse/restored stable keys and incident connections reconstruct organization while never deleting a created note or changing membership.
- [ ] Removed items/memberships invalidate replay, including remove/re-add races; history has the approved 100-entry session limit and reload resets it.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/boardHistory.test.ts`
- [ ] `pnpm --filter @mindspool/backend exec vitest run convex/boardOperations.test.ts`
- [ ] `pnpm --filter @mindspool/web typecheck`
- [ ] Regression: undo outside-item placement leaves assigned label; undo new-note placement leaves the library note.

**Dependencies:** Task 27.

**Files likely touched:**

- `apps/web/src/boards/boardHistory.ts`
- `apps/web/src/boards/boardHistory.test.ts`
- `packages/backend/convex/boardOperations.ts`
- `packages/backend/convex/boardOperations.test.ts`

**Estimated scope:** Medium: 4 files.

## Task 29: Expose undo and redo through the save pipeline

**Description:** Connect history to completed interactions, toolbar controls, keyboard shortcuts, and acknowledged operation submission.

**Acceptance criteria:**

- [ ] Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y work in focused canvas and leave input editing intact; buttons show availability.
- [ ] Undo/redo persists through the same optimistic/revisioned pipeline; failures/conflicts retain the correct draft and history pointer.
- [ ] Complete card/column/heading/connection/group actions restore precisely, and unavailable replay explains invalid membership/deleted items.

**Verification:**

- [ ] `pnpm --filter @mindspool/web exec vitest run src/boards/BoardView.test.tsx src/boards/boardHistory.test.ts src/boards/boardSession.test.ts`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Browser: undo/redo column deletion and card removal with edges; undo note and All-library placements; verify library data remains.

**Dependencies:** Task 20, Task 28.

**Files likely touched:**

- `apps/web/src/boards/useBoardSession.ts`
- `apps/web/src/boards/BoardControls.tsx`
- `apps/web/src/boards/BoardCanvas.tsx`
- `apps/web/src/boards/BoardView.tsx`
- `apps/web/src/boards/BoardView.test.tsx`

**Estimated scope:** Medium: 5 files.

## Task 30: Verify complete desktop behavior against the design

**Description:** Run the actual authenticated board flow, visual comparison, keyboard/trackpad checks, failure/conflict cases, and lifecycle races. Record evidence before any completion claim.

**Acceptance criteria:**

- [ ] 1440×900 and smaller desktop review covers rail/grid/fonts/tools/cards/tray/inspector; no deferred frame/export/edit controls leak into v1.
- [ ] Real browser verifies zoomed drops/resizes/column operations/connection endpoints/history/reopen, plus authenticated library membership and note persistence.
- [ ] Two sessions, ambiguous retries, offline recovery, unsaved navigation, multi-page revision changes, and remove/re-add during cleanup have credible evidence or remain explicitly open.

**Verification:**

- [ ] `pnpm --filter @mindspool/web test`
- [ ] `pnpm --filter @mindspool/backend test`
- [ ] `pnpm --filter @mindspool/web build`
- [ ] Use T3 preview first (status, then open if needed); distinguish authenticated transport from mocked component tests; create focused repair tasks for defects.

**Dependencies:** Task 29.

**Files likely touched:**

- `docs/verification/boards.md`
- `docs/design/boards.md`
- `SPEC-boards.md`

**Estimated scope:** Medium: 3 files.

## Task 31: Measure performance and close integration evidence

**Description:** Measure the reviewed small-board fixture and finish regression/documentation checks. Optimize only measured failures in separate focused repair tasks.

**Acceptance criteria:**

- [ ] 100 mixed cards, 10 columns, and 100 connections meet the reviewed 33ms p95 frame target on a recorded desktop; measure a 10-second pan/drag interaction after load.
- [ ] No per-pointer mutations or full-library loads occur; sparse-label tray pagination cost and coherent layout assembly are documented.
- [ ] All spec criteria have appropriate evidence, focused/full checks pass, status docs are accurate, design remains ignored, and archived Reddit gaps remain unchanged.

**Verification:**

- [ ] `pnpm check`
- [ ] `pnpm exec prettier --check SPEC-boards.md docs/design/boards.md docs/verification/boards.md CAPABILITY-MAP-web-redesign.md README.md tasks/plan.md tasks/todo.md`
- [ ] `git diff --check`
- [ ] `git check-ignore -v deisgn.html`
- [ ] Record browser/hardware/network/fixture and frame/write/query metrics; do not infer them from unit tests.

**Dependencies:** Task 30.

**Files likely touched:**

- `docs/verification/boards.md`
- `SPEC-boards.md`
- `CAPABILITY-MAP-web-redesign.md`
- `README.md`

**Estimated scope:** Medium: 4 files.

### Checkpoint: Complete

- [ ] Tasks 1–31 and every applicable SPEC-boards success criterion are verified; browser/performance gaps are not silently marked complete.
- [ ] `pnpm check` and `git diff --check` pass; `deisgn.html` remains ignored.
- [ ] Review the implemented behavior, design comparison, measured performance, and recorded limitations with the user. Production deployment and publishing remain outside this plan.
