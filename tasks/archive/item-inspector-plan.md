# Implementation Plan: item-inspector

Spec: [SPEC-item-inspector.md](../SPEC-item-inspector.md) (approved, including the proposed defaults for its open
questions). Capability map: [CAPABILITY-MAP-web-redesign.md](../CAPABILITY-MAP-web-redesign.md), module 3 of 7. The
library-view plan and tasks are archived in `tasks/archive/library-view-*.md` (its manual 390px, Lighthouse and
offline-retry checks are still pending in `docs/verification/library-view.md`). Tasks: [todo.md](todo.md).

## Overview

Open one saved item from the library in a right-hand panel built on the shadcn `sidebar` primitive (ReUI `c-sidebar-4`):
source header, preview, title, saved line, confirmed labels with remove and an add-label popover, the latest
processing-run facts, and delete. The panel mounts into the 380px column that `library-view` reserved, driven by `?item`.
Backend first: `items.detail` (safe read), `items.remove` (bounded delete) and the 10-row clamps on item-scoped label
joins, then the panel from the outside in.

## Architecture Decisions

- **Backend before UI, in two independent tasks.** `detail` and the clamps (T1) unblock every read; `remove` (T2) is only
  needed by delete (T9). Neither touches schema or indexes.
- **Reads go through `items.detail` only.** It takes a string id and returns `null` for foreign, missing, malformed and
  deleted ids, so a bad `?item` can never reach the error boundary. `itemLabels` and `processingRuns` queries mount only
  after `detail` returns an item (their typed ids come from its `_id`).
- **Delete is atomic and capped** (spec decision): one transaction removes the item, up to 500 `itemLabels` rows and 100
  runs, and refuses with `CONFLICT` past that, so no orphan can break `itemLabels.listItemsForLabel`.
- **Frame spike first, then content.** T3 installs `c-sidebar-4`, mounts the frame in `LibraryView` and records what the
  primitive actually does (see Risks). Content tasks build on whatever T3 settles, so the uncertain part fails early.
- **Own `SidebarProvider`** for the inspector so its state is independent of the left navigation. Its open state is
  controlled from the URL (`?item` present = open), on desktop through `open` and on mobile through `setOpenMobile`.
- **Grid follows container width** (T5, independent) so opening the inline panel turns three columns into two instead of
  squeezing them.
- **Lazy label picker.** `availableLabels` is subscribed only while the popover is open.
- **Not in this module:** suggested labels, accept/reject, reprocess (`label-suggestions`), Add to board (`boards`), title
  editing, creating labels from the picker, image fetching.

## Dependency Graph

```
T1 items.detail + join clamps ──┬─ T3 panel frame (spike) ─┬─ T4 header + preview ─┬─ T6 labels list/remove ─ T7 add-label popover
                                │                          │                       ├─ T8 run card
T2 items.remove ────────────────┼──────────────────────────┤                       └─ T9 delete dialog (also needs T2)
                                │                          └─ T5 container-width grid
                                                                          T10 focus, keyboard, a11y ─ T11 docs + verification
```

T1 and T2 are independent. After T4, T5, T6, T8 and T9 are independent of each other (T7 follows T6). T10 needs T4–T9.

## Risks and Mitigations

| Risk                                                                                                                                                                                                                                         | Impact | Mitigation                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shadcn `sidebar` is a `fixed`, full-height panel with a width-reserving gap and a Sheet below 768px; the spec wants an overlay between 768 and 1280px and an inline column above. Whether `c-sidebar-4` docks or floats is not known yet | High   | T3 is a spike with a report: install, mount, record behavior at 1440, 1024, 390px. Close gaps with the primitive's props (`variant`, `collapsible`, gap width). If a plain `sheet` is needed, stop and ask before building |
| Second `SidebarProvider`: Ctrl/Cmd+B toggles every provider and each writes the `sidebar_state` cookie, so the shortcut would also toggle the inspector                                                                                      | Med    | Controlled `open`; T3 adds a small local opt-out to the copied `sidebar.tsx` (we own it) if the shortcut still reaches the inspector. The cookie is not read by the app                                                    |
| Mobile mode ignores `open` and uses `openMobile`                                                                                                                                                                                             | Med    | Sync `?item` to `setOpenMobile` in an effect; test with a mocked media query                                                                                                                                               |
| Delete leaves a stale `?item`, so the panel flashes "Not found"                                                                                                                                                                              | Low    | Remove `item` from the URL right after the mutation resolves, before announcing; test it                                                                                                                                   |
| Over-cap delete or partial writes                                                                                                                                                                                                            | High   | Single transaction, caps checked before the first delete, tests prove nothing is deleted when refused                                                                                                                      |
| Clamping `listForItem`/`availableLabels` to 10 breaks existing tests or callers                                                                                                                                                              | Med    | T1 greps consumers (only tests today) and updates assertions deliberately; web uses 10 per page with "Show more"                                                                                                           |
| Existing shared mocks only know the library queries                                                                                                                                                                                          | Low    | Extend `test-utils/mocks.ts` in the first task that needs each query (T3 detail, T6 labels, T7 available, T8 runs, T9 remove)                                                                                              |
| Rendering up to 100,000 characters of note text                                                                                                                                                                                              | Low    | Plain text in a scroll region, `whitespace-pre-wrap`, never HTML; manual check in T11                                                                                                                                      |
| Focus handling across inline and overlay modes                                                                                                                                                                                               | Med    | One dedicated task (T10) with explicit tests: focus stays on the row when inline, is trapped in overlay, returns to the row on close                                                                                       |

## Checkpoints

- After T5: panel opens from `?item` with header, title, saved line and preview; inline at 1440px, overlay below 1280px;
  grid becomes two columns with the panel open. Review with human (visual).
- After T9: labels, run card and delete all work against dev Convex; deleting removes the item from list and label views.
  Review with human.
- After T11: all spec success criteria met; manual 1440px, 1024px and 390px checks recorded.

## Open Questions

None blocking. Carried defaults from the spec: atomic capped delete, no create-label in the picker, overlay below
1280px, container-width grid. The spike (T3) may change the overlay mechanism; it will be reported before it is built.

## Spike findings

Found from the source of `c-sidebar-4` and `sidebar.tsx` and from jsdom tests; the three widths have **not** been looked
at in a browser yet (open manual check, T3/T11).

- `c-sidebar-4` is a demo composed from the installed `sidebar` primitive (`side="right"`, `collapsible="offcanvas"`), so
  nothing was installed. The desktop branch is a `fixed inset-y-0 h-svh` container at the viewport's right edge, beside
  a `sidebar-gap` spacer that reserves `--sidebar-width` in flow while open. That is the inline column at 1280px and up
  (the spacer sits at the end of `LibraryView`'s flex row).
- Overlay below 1280px: the same container, with the spacer collapsed by `max-xl:[&_[data-slot=sidebar-gap]]:w-0` on the
  provider, so the panel floats over the list instead of pushing it.
- Below 768px (`useIsMobile`) the primitive swaps to a `Sheet` driven by `openMobile`, not `open`. Mobile width was
  hard-coded to 18rem.
- Changes to our copy of `sidebar.tsx` (all opt-in, defaults unchanged): `openMobile`/`onOpenMobileChange` on the provider
  (controlled sheet), `keyboardShortcut={false}` (Ctrl/Cmd+B opt-out), `mobileWidth` on `Sidebar` (the inspector uses
  `100vw`). The uncontrolled path keeps the plain state setter: wrapping it in a changing callback stopped the left
  navigation sheet from unmounting on close in tests.
- The sheet still renders its own `sr-only` "Close" button (hidden by CSS only), next to ours.
