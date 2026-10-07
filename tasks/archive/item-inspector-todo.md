# Tasks: item-inspector

Plan: [plan.md](plan.md). Spec: [SPEC-item-inspector.md](../SPEC-item-inspector.md). Follow task order and checkpoints;
one task per turn. Focused tests: `pnpm --filter @mindspool/web test`, `pnpm --filter @mindspool/backend test`.
Typecheck: `pnpm --filter @mindspool/web typecheck`. Build: `pnpm --filter @mindspool/web build`. Full: `pnpm check`.
The three backend changes (T1, T2) are approved by the spec. New dependencies, schema or index changes, and image upload
need a question first. `pnpm check` currently fails only on `.mcp.json` (committed unformatted, not ours).

## Phase 1: Backend

- [x] **T1: `items.detail` and join clamps** (M)
  - Add `items.detail({ id: v.string() })` returning `null` for foreign, missing, malformed and deleted ids
    (`ctx.db.normalizeId` plus owner check, like `labels.get`) and otherwise `_id`, `_creationTime`, `inputType`,
    `originalInput`, `originalUrl`, `canonicalUrl`, `captureSource`, `enrichmentStatus`, `sourceMetadata` (title,
    description, author, siteName). No `ownerId`, `captureKey` or run pointers. Clamp `itemLabels.listForItem` and
    `itemLabels.availableLabels` pages to 10 (constant shared with `PREVIEW_PAGE_SIZE`). `items.get` is unchanged.
  - Acceptance:
    - [x] `detail` returns the item with exactly the listed fields; `null` for foreign, missing, malformed ids.
    - [x] Both label joins return at most 10 rows however large `numItems` is.
    - [x] Existing `items.get` and label tests still pass or are updated deliberately.
  - Verify: `pnpm --filter @mindspool/backend test` (new tests for `detail` and both clamps) and `pnpm typecheck`.
  - Files: `convex/validators.ts`, `convex/items.ts`, `convex/itemLabels.ts`, `convex/items.test.ts`, `convex/itemLabels.test.ts`.

- [x] **T2: `items.remove` with bounded cascade** (M)
  - `items.remove({ id: v.id("items") })`: ownership check ("Not found" for foreign or missing); read up to 501
    `itemLabels` rows via the `by_owner_pair` prefix and 101 `processingRuns` rows via `by_owner_item`; if either cap is
    exceeded throw `CONFLICT` before deleting anything; otherwise delete the rows, any `stored` image assets from
    `_storage`, and the item, in one transaction.
  - Acceptance:
    - [x] Item, its links and its runs are gone; other items, labels, runs and other owners' data are untouched.
    - [x] Foreign and missing ids are rejected with the standard error; unauthenticated calls fail.
    - [x] Over the cap nothing is deleted; the item disappears from `items.list` and label lists after a delete.
  - Verify: `pnpm --filter @mindspool/backend test` (ownership, cascade, caps, list disappearance), `pnpm typecheck`.
  - Files: `convex/items.ts`, `convex/items.test.ts` (and `convex/itemLabels.test.ts` for the label-list case).

### Checkpoint: Backend

- [x] `pnpm --filter @mindspool/backend test` and `pnpm typecheck` green. No UI change yet.

## Phase 2: Panel frame

- [x] **T3: Panel frame spike on the shadcn sidebar** (M)
  - Install `c-sidebar-4` (`npx shadcn@latest add @reui/c-sidebar-4`, into `packages/ui`) and read its source. Build
    `inspector/ItemInspector.tsx` as a right-side `Sidebar` inside its own `SidebarProvider`, mounted in `LibraryView`
    in place of the empty `#inspector` aside. Open state comes from `?item` (`open` on desktop, `setOpenMobile` on
    mobile); a close button removes `item` and keeps `layout`. Content for now: skeleton while `items.detail` loads,
    the spec's "Not found" notice when it returns `null`, and the item's title once loaded. Extend the shared mocks with
    `items:detail`. Record what the primitive does at 1440px, 1024px and 390px in the plan's new "Spike findings" section.
  - Acceptance:
    - [x] Selecting an item opens the panel; closing removes only `item`; a malformed or foreign id shows "Not found" and the list stays usable.
    - [x] Inline 380px column at 1280px and above; overlay below 1280px; full width below 768px (or the gap is reported, see Risks).
    - [x] Ctrl/Cmd+B does not toggle the inspector; the left navigation still works.
  - Verify: tests (open from URL, close, loading, not found, mocked media query); `typecheck`, `build`; manual look at the three widths (**still pending**).
  - Files: `packages/ui/src/components/` (installed example parts, `sidebar.tsx` only if the shortcut needs an opt-out), `inspector/ItemInspector.tsx`, `library/LibraryView.tsx`, `test-utils/mocks.ts`, test.
  - Depends on: T1.
  - **Stop and report** findings if the primitive cannot meet the layout intent; do not substitute a `sheet` silently.

- [x] **T4: Header and preview** (M)
  - `InspectorHeader` (brand icon or Globe or note icon, host or "note", "Open original (new tab)" link only for
    http/https with `target="_blank"` and `rel="noopener noreferrer"`, close), `InspectorPreview` (kind tile, title via
    `displayTitle`, saved line, note text with `whitespace-pre-wrap` in a scroll region, or link URL, canonical URL when
    different, description, author and site name), and pure `savedLine.ts` ("Saved 4m ago from browser extension", short
    date after seven days) reusing `relativeDate` and the capture-source names.
  - Acceptance:
    - [ ] Note whitespace shown exactly as stored; stored text is never rendered as HTML.
    - [ ] Open-original link hidden for notes; opens safely for links.
    - [ ] Saved line uses the injected clock.
  - Verify: tests (savedLine, title rule, whitespace, link details, link attributes); `typecheck`, `build`.
  - Files: `inspector/{InspectorHeader,InspectorPreview,ItemInspector}.tsx`, `inspector/savedLine.ts`, tests.
  - Depends on: T3.

- [x] **T5: Grid columns follow container width** (S)
  - `ItemGrid` uses container queries instead of viewport breakpoints: one column below 560px of list width, two from
    560px, three from 960px (so 1440px without the panel stays three columns and with the panel open becomes two).
  - Acceptance:
    - [ ] Grid classes are container-based; library-view grid tests still pass.
    - [ ] With the inline panel open at 1440px the grid shows two columns (manual).
  - Verify: `pnpm --filter @mindspool/web test`, `typecheck`, `build`; manual at 1440px with and without the panel.
  - Files: `library/ItemGrid.tsx`, `library/LibraryView.tsx`, test.
  - Depends on: T3.

### Checkpoint: Panel frame

- [ ] `pnpm check` green; panel opens from a row, a card and a deep link with header, title, saved line and preview;
      inline at 1440px, overlay at 1024px, full width at 390px; grid is two columns with the panel open. Review with human.

## Phase 3: Labels and processing

- [x] **T6: Confirmed labels with remove** (M)
  - `InspectorLabels`: `usePaginatedQuery(itemLabels.listForItem)` ten per page with "Show more", `LabelTag` per label with
    a "Remove <name>" button calling `itemLabels.remove`, empty "No labels yet.", failure shown in `role="alert"` with the
    list unchanged, controls disabled only during their own call. Mount after `detail` returns an item. Extend mocks
    (`itemLabels:listForItem`, `itemLabels:remove`).
  - Acceptance:
    - [x] Removing a label calls `remove` with the right ids and the row's tag disappears through the reactive query (mocked).
    - [x] Show more requests the next page; empty and failure states are visible and announced.
  - Verify: tests (list, empty, remove, show more, failure); `typecheck`, `build`.
  - Files: `inspector/InspectorLabels.tsx`, `inspector/ItemInspector.tsx`, `test-utils/mocks.ts`, test.
  - Depends on: T4.

- [x] **T7: Add-label popover** (M)
  - `AddLabelPopover`: "Add label" opens a popover subscribing to `itemLabels.availableLabels` only while open (ten per
    page, "Show more"); each label is a checkbox reflecting `isAssigned`, toggling calls `attach` or `remove`. No labels:
    "You have no labels yet. Create one from the sidebar." Failures in `role="alert"`.
  - Acceptance:
    - [x] Toggling calls the right mutation with the right ids; state follows the query result.
    - [x] No subscription while closed; no-labels message and failure alert visible.
  - Verify: tests (open/close, toggle both ways, show more, empty, failure, lazy subscription); `typecheck`, `build`.
  - Files: `inspector/AddLabelPopover.tsx`, `inspector/InspectorLabels.tsx`, `test-utils/mocks.ts`, test; a `popover` primitive in `packages/ui` if one is not installed (shadcn add, no new dependency).
  - Depends on: T6.

- [x] **T8: Processing-run card** (S)
  - `RunCard`: heading "Processing"; with a run (`processingRuns.listForItem`, `numItems: 1`) rows for provider, model,
    input modality, question version, status (and error when failed), latency in ms, cost in USD, each only when present;
    with no run, the `ProcessingStatus` line for `enrichmentStatus`. Extend mocks (`processingRuns:listForItem`).
  - Acceptance:
    - [x] All fields render when present; missing fields are omitted, none invented.
    - [x] A failed run shows its error; no run falls back to the status line.
  - Verify: tests for each case; `typecheck`, `build`.
  - Files: `inspector/RunCard.tsx`, `inspector/ItemInspector.tsx`, `test-utils/mocks.ts`, test.
  - Depends on: T4.

### Checkpoint: Labels and processing

- [x] `pnpm check` green; add and remove a label in the panel and see the row's tags and the label view change without a
      reload, against dev Convex; run card shows real data. Review with human.

## Phase 4: Delete and close

- [x] **T9: Delete with confirmation** (M)
  - `DeleteItemDialog`: "Delete" opens a dialog ("Delete this item? Its original and label links are removed. This cannot
    be undone."), Cancel is the default focus, confirm calls `items.remove`, then removes `item` from the URL, closes the
    dialog and panel, and the library announces "Item deleted" in a polite `role="status"`. Failure keeps the dialog open
    with the backend message in `role="alert"`. Extend mocks (`items:remove`).
  - Acceptance:
    - [x] Cancel and Escape do nothing to the item; confirm deletes once, closes the panel, announces.
    - [x] A failed delete leaves the dialog and item in place with the error shown.
    - [x] After delete the URL has no `item`, with no "Not found" flash in the test.
  - Verify: tests (cancel, confirm, failure, URL, announcement); `typecheck`, `build`.
  - Files: `inspector/DeleteItemDialog.tsx`, `inspector/ItemInspector.tsx`, `library/LibraryView.tsx`, `test-utils/mocks.ts`, test.
  - Depends on: T2, T4.

- [x] **T10: Focus, keyboard and accessibility** (S)
  - Escape inside the panel and the close button close it; focus returns to the selected row or card when it is still on
    the page; inline mode never steals focus from the list; overlay mode moves focus in and traps it; the panel is a
    labelled complementary region with an `<h2>` naming the item; controls have the specified names ("Remove <label>",
    "Open original (new tab)", "Close").
  - Acceptance:
    - [x] Tests for Escape, focus return, focus not stolen inline, trap in overlay, and the accessible names.
    - [x] axe has no serious issues in the panel states where jsdom allows it.
  - Verify: tests; `typecheck`, `build`; manual keyboard pass.
  - Files: `inspector/ItemInspector.tsx`, `inspector/InspectorHeader.tsx`, `library/ItemList.tsx`, `library/ItemGrid.tsx`, tests.
  - Depends on: T4–T9.

- [x] **T11: Docs and verification record** (S)
  - Write `docs/verification/item-inspector.md` (commands and results, criterion-by-criterion evidence, deviations, spike
    findings, open manual checks); update `README.md`, `docs/core-concepts.md` (`items.detail`, `items.remove`, caps,
    clamps) and the capability-map status; remove `tasks/` references that went stale.
  - Acceptance: every spec success criterion has evidence or is listed as a pending manual check; no test dropped without replacement.
  - Verify: `pnpm check` and a manual run.
  - Depends on: T1–T10.

### Checkpoint: Complete

- [ ] All SPEC-item-inspector success criteria met (1440px, 1024px, 390px, Lighthouse accessibility at least 95); human
      review; then write `SPEC-search-and-filters.md`.
