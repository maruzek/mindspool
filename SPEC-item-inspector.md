# Spec: item-inspector

Module id `item-inspector` in [CAPABILITY-MAP-web-redesign.md](CAPABILITY-MAP-web-redesign.md). Depends on the implemented
`library-view` and the existing `core-library` backend. Design source: `Mindspool Base Modernist v3.dc.html`, section 02,
the right-hand `<aside>` for the selected item. The inspector mounts into the 380px column that `library-view` reserved
(`#inspector`, hidden while empty).

## Objective

Let the owner open one saved item from the library and see everything stored about it, manage its labels, and delete it.

Success looks like: a signed-in user selects a row or card, and the right panel shows where the item came from, its
preview, title, when and how it was saved, its confirmed labels, and the facts of its latest processing run. They add or
remove labels in place and the library row updates immediately. They can open the original link, delete the item after a
confirmation, and close the panel. A deep link `/library?item=<id>` opens straight into it. A foreign, deleted, or
malformed id shows "Not found" in the panel and never breaks the page.

Users: a single signed-in owner, desktop first, usable down to phone width.

## Assumptions

1. Selection stays in the URL (`?item=<id>`), as built in `library-view`. Closing the panel removes `item` and keeps
   `layout`. The panel works on `/library` and `/labels/$labelId`; on a label page an item that is not in that label can
   still be opened by id.
2. **Structure: ReUI `c-sidebar-4` ("Right-hand inspector panel").** The panel is built from the same shadcn `sidebar`
   primitives already in `packages/ui` (`side="right"`), adapted from that ReUI example as the web-shell frame was from
   `c-sidebar-1`/`c-sidebar-2`: its off-canvas behavior, header actions and status badge are reused, not hand-rolled. It
   gets its own `SidebarProvider` so it does not share open state with the left navigation. Layout intent: from 1280px the
   panel is the inline 380px column; below 1280px it overlays the page (240px sidebar plus 380px panel leaves too little
   for the list), and below 768px it is full width. The first task installs the example and records what the primitive does
   by default (docked versus floating, its mobile breakpoint, which is 768px in the shadcn sidebar); any gap against this
   intent is closed with the primitive's own props, and a gap that needs a plain `sheet` instead is reported before
   building.
3. **Scope against the design.** Present now, from real data only: source header, open-original link, preview, title,
   saved line, confirmed labels with remove, add label, processing-run facts, delete. Moved out:
   - suggested (dashed) labels, confidence meters, accept/reject, "Reprocess", "Compare with Jev": `label-suggestions`
     (there is no suggestion model yet);
   - "Add to board": `boards`;
   - the overflow menu (`…`): nothing to put in it, so it is not rendered;
   - title editing: no backend for it, the title is read-only.
     The capability map row is amended accordingly (done with this spec).
4. The title is `sourceMetadata.title`, else host and path for links, else the first non-empty line of a note, the same
   rule as the list (`displayTitle`).
5. Preview content, with whitespace preserved (`whitespace-pre-wrap`) for notes:
   - note: the original text in a scrollable region (no height limit on what is stored; the region scrolls);
   - link: the URL, the canonical URL when it differs, and `sourceMetadata` description, author and site name when present.
     The design's image tile is the same hatched kind tile as the list; no image is fetched or rendered.
6. Adding a label means choosing from existing labels. Creating a label stays in the sidebar's dialog (it navigates to the
   new label, which would be wrong inside an item). Listed under Open Questions.
7. "Remove" on an item's label writes the existing manual `exclude` decision (`itemLabels.remove`); future suggestions
   will not re-add it. The item leaves that label's list immediately through reactive queries.
8. The processing card shows the latest run (`processingRuns.listForItem`, newest first, one row) with provider, model,
   input modality, question version, status, error, latency and cost, each only when present. With no run it shows the
   item's `enrichmentStatus` line from `library-view` (for example "Saved — original stored").
9. All dates use the same single clock source as the list so tests can fix time. The saved line reads
   "Saved 4m ago from browser extension"; after seven days "Saved Sep 27 from web".

## Tech Stack

React 19.2, TanStack Router (typed search params already in place), Convex 1.46 (`useQuery`, `usePaginatedQuery`,
`useMutation`), shadcn `base-nova` + ReUI (`sidebar` via `c-sidebar-4`, `dialog`, `button`, `badge`, `skeleton`, `separator`, `dropdown-menu` only if the example needs it), Clerk, Vitest + Testing
Library, `convex-test`. No new packages.

## Backend changes (approval needed: ask-first items)

The current API cannot serve the panel safely: `items.get` takes a typed id (a malformed id in the URL throws and would
take the whole library page down through the error boundary), returns the whole stored document including internal fields,
and no delete exists. Three additions, no schema or index change:

**1. `items.detail({ id: v.string() })` returns the item or `null`.** Foreign, missing, and malformed ids all read as
`null` (`ctx.db.normalizeId` plus an owner check, like `labels.get`). Returned fields: `_id`, `_creationTime`, `inputType`,
`originalInput`, `originalUrl`, `canonicalUrl`, `captureSource`, `enrichmentStatus`, `sourceMetadata`
(title, description, author, siteName). `ownerId`, `captureKey`, and run pointers are not returned. `items.get` stays as is.

**2. `items.remove({ id: v.id("items") })` deletes the item and its dependents in one transaction.**
Ownership checked (foreign and missing ids give the standard "Not found"). It deletes the item's `itemLabels` rows
(all decisions, through the `by_owner_pair` prefix, `take(501)`) and `processingRuns` rows (`by_owner_item`, `take(101)`),
and any `stored` image assets from `_storage`. Bounds: at most 500 `itemLabels` rows and 100 runs; beyond that the mutation
throws `CONFLICT` and deletes nothing, rather than leaving orphans that would break `itemLabels.listItemsForLabel`
(it requires every joined item to exist). Today a stored asset cannot exist (uploads are rejected until an
ownership-checked flow exists), so the storage step is for correctness only.

**3. Clamp item-scoped label joins to ten rows:** `itemLabels.listForItem` and `itemLabels.availableLabels` cap a page at 10
(they currently allow 100), matching the joined-read limit in `docs/core-concepts.md`. `processingRuns.listForItem` already
clamps to 10. The panel pages with "Show more".

Tests (`convex-test`): `detail` returns `null` for foreign, missing, malformed, and deleted ids and omits internal fields;
`remove` deletes the item, its links, and its runs, leaves other items, labels and other owners' data untouched, rejects
foreign ids, refuses over the cap without deleting, and the item disappears from `items.list` and label lists; the clamps.

## Commands

```
Dev:        pnpm dev:web
Test:       pnpm --filter @mindspool/web test        pnpm --filter @mindspool/backend test
Typecheck:  pnpm --filter @mindspool/web typecheck
Build:      pnpm --filter @mindspool/web build
All checks: pnpm check
```

## Routes and URL state

No new routes. `?item=<id>` (existing) opens the panel; removing it closes it. `Escape` while focus is inside the panel,
the close button, and a successful delete all remove `item` and keep the other params. Closing returns focus to the
selected row or card when it is still on the page.

## Project Structure

```
apps/web/src/inspector/
  ItemInspector.tsx       frame on the shadcn `sidebar` (from `c-sidebar-4`): loading, not found, content; close
  InspectorHeader.tsx     source icon + host, open-original link, close
  InspectorPreview.tsx    kind tile, title, saved line, note text or link details
  InspectorLabels.tsx     confirmed labels with remove, "Show more", add-label trigger
  AddLabelPopover.tsx     checklist of labels with attach/remove toggles
  RunCard.tsx             latest processing run facts
  DeleteItemDialog.tsx    confirmation and delete
  savedLine.ts            "Saved 4m ago from web" (pure; reuses relativeDate)
  *.test.tsx, savedLine.test.ts
apps/web/src/library/LibraryView.tsx   mounts <ItemInspector/> into #inspector; announces "Item deleted"
apps/web/src/library/ItemGrid.tsx      grid columns follow the container width (see Behavior)
packages/backend/convex/{items,itemLabels}.ts   detail, remove, clamps + tests
```

## Behavior

**Opening and closing**

- Selecting a row or card sets `?item`; the panel opens without moving focus on desktop (focus stays on the row, so
  keyboard users can keep moving through the list). In overlay mode focus moves into the panel and is trapped until it closes.
- While `items.detail` is loading the panel shows skeletons. A `null` result shows "Not found" with the standard text
  ("That page or item does not exist, or it is not yours.") and a close button; the library list stays usable.
- The panel is a labelled complementary region ("Item inspector"). Its title is an `<h2>` that names the item.

**Header and preview**

- Header: brand icon or Globe (or note icon for notes), the host or "note", an "Open original" link
  (`target="_blank"`, `rel="noopener noreferrer"`, only for http/https URLs, with an accessible name that says it opens a
  new tab), and a close button.
- Below: the kind tile, the title, the saved line, then the preview content from Assumption 5.

**Labels**

- Confirmed labels use `LabelTag`. Each has a remove control named "Remove <label name>"; pressing it calls
  `itemLabels.remove`. Ten labels per page, with "Show more" while more exist. Empty: "No labels yet."
- "Add label" opens a popover listing the owner's labels (`itemLabels.availableLabels`, ten per page, "Show more"), each a
  checkbox reflecting `isAssigned`; toggling calls `attach` or `remove`. No labels at all: "You have no labels yet. Create
  one from the sidebar."
- A failed attach, remove or delete shows the backend message through `errorMessage` in `role="alert"` inside the panel and
  leaves the UI state unchanged. Controls are disabled only while their own call is in flight.
- The library rows and label views update through the reactive queries, with no manual refresh.

**Processing card**

- Heading "Processing". With a run: rows for provider, model, input, question version, status (and error text when
  failed), latency in ms and cost in USD. Rows without data are omitted; nothing is invented. Without a run: the
  `ProcessingStatus` line for the item's `enrichmentStatus`.

**Delete**

- "Delete" opens a confirmation dialog: "Delete this item? Its original and label links are removed. This cannot be
  undone." Cancel is the default focus. Confirm calls `items.remove`, closes the dialog and the panel, and a polite
  toast (sonner, announced through its polite live region) says "Item deleted". On failure the dialog stays open with the message.
- Only the selected item can be deleted from here; there is no bulk delete.

**Layout**

- Inline column (>= 1280px) or overlay (< 1280px) as in Assumption 2. When the inline panel is open the list column is
  narrower, so grid columns follow the container width (CSS container queries) instead of the viewport. Thresholds keep one
  column below 560px, two from 560px, three from 960px of list width: at 1440px without the panel the grid stays three
  columns, with the panel open it becomes two.

## Code Style

Tokens only; zero radius and 2px rules; registry components with their own states. Pure helpers stay free of React.

```tsx
export function ItemInspector({ itemId }: { itemId: string }) {
  const item = useQuery(api.items.detail, { id: itemId });
  if (item === undefined) return <InspectorSkeleton />;
  if (item === null) return <InspectorNotFound />;
  return (
    <InspectorFrame item={item}>
      <InspectorPreview item={item} />
      <InspectorLabels itemId={item._id} />
      <RunCard itemId={item._id} enrichmentStatus={item.enrichmentStatus} />
      <DeleteItemDialog itemId={item._id} />
    </InspectorFrame>
  );
}
```

## Testing Strategy

Vitest and Testing Library with the shared Clerk/Convex mocks (extended for the new queries and mutations); backend with
`convex-test`.

- Backend: see Backend changes.
- Frame: loading, not found, open from `?item`, close removes only `item`, Escape and close button, overlay below 1280px
  (mocked media query), focus returns to the row.
- Preview: title rule, saved line with a fixed clock, note whitespace preserved verbatim, link details and canonical URL,
  open-original link only for http(s) with `rel`.
- Labels: list, empty, remove calls `itemLabels.remove` with the right ids, add popover toggles `attach`/`remove`, show
  more, no-labels message, failure alert keeps state.
- Run card: all fields, missing fields omitted, failed run with error, no run falls back to the status line.
- Delete: confirmation text, Cancel does nothing, confirm calls `items.remove`, closes the panel, announces, failure keeps
  the dialog open.
- Regression: `library-view` tests stay green; selecting rows still only changes `?item`.
- Manual: compare with design section 02 at 1440px, check 1024px (overlay) and 390px, record in
  `docs/verification/item-inspector.md`.

## Boundaries

- Always: owner-check every read and write; show only fields the owner needs; keep joined reads bounded; render stored
  text as text (never as HTML); tokens not hex; run `pnpm check` before committing.
- Ask first: the three backend changes above (this spec asks), any schema or index change, adding dependencies, image
  upload or fetching, editing titles or any other new write.
- Never: expose `ownerId`, `captureKey`, or another owner's labels or items; delete without confirmation; weaken or delete
  existing tests; leave orphaned `itemLabels` or run rows; render untrusted HTML or `javascript:` URLs.

## Success Criteria

1. `pnpm check` passes with the new backend and web tests; no test dropped without replacement.
2. Selecting an item opens the panel with source, title, saved line, preview and labels; closing removes only `item`;
   `/library?item=<id>` and `/labels/<id>?item=<id>` open it directly.
3. A foreign, deleted, or malformed id shows "Not found" in the panel, never an error screen, and reveals nothing.
4. Adding and removing a label in the panel changes the row's tags and the label view without a reload.
5. Deleting an item removes it, its label links and its runs; it disappears from the list and label views; other items,
   labels and owners are untouched; over-cap deletes are refused and change nothing.
6. Note whitespace is shown exactly as stored; no stored text is interpreted as HTML; the open-original link is shown
   only for http(s) and opens safely.
7. At 1440px the panel is inline and matches design section 02; below 1280px it is an overlay with focus trapped and
   restored; at 390px there is no horizontal scroll.
8. Accessibility: labelled landmark, named controls ("Remove <label>", "Open original (new tab)", "Close"), alerts and the
   delete announcement exposed, axe-clean in tests where feasible, Lighthouse accessibility at least 95.

## Open Questions

Defaults are proposed so none block the plan; say if you want a different one.

1. **Delete design (backend change 2):** atomic delete with a 500-link / 100-run cap that refuses beyond it (proposed), or
   a self-scheduling background purge with no cap but a short window in which joins must tolerate missing items?
2. **Create a label from the item's picker:** left out (proposed, labels are created in the sidebar). Alternative: a small
   inline "Create and add" field in the popover, which needs a design decision because the sidebar dialog navigates away.
3. **Overlay breakpoint at 1280px** (proposed) versus keeping the inline column down to 1024px with a narrower list.
4. **Container-query grid** changes the library-view grid rule from viewport to container width (the 1440px result without
   the panel is unchanged). Acceptable?

The next gate is your approval of this spec; the plan and task list follow only after it.
