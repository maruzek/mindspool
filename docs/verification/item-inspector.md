# Item inspector verification

Date: 2026-10-07. Branch: `feature/web-shell` (uncommitted at the time of writing).
Spec: [SPEC-item-inspector.md](../../SPEC-item-inspector.md). Plan: `tasks/plan.md`.

## Automated

| Check                 | Result                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| `pnpm test` (backend) | 7 files, 53 tests pass (8 new: `items.detail`, `items.remove`, join clamps)   |
| `pnpm test` (web)     | 16 files, 155 tests pass (37 new, in `inspector/` and `LibraryView.test.tsx`) |
| `pnpm typecheck`      | 6 of 6 workspaces pass                                                        |
| `pnpm build`          | passes                                                                        |
| `pnpm format:check`   | Fails only on `.mcp.json`, committed unformatted earlier and untouched here   |

## Success criteria

| #   | Criterion                                              | Evidence                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm check` passes, no test dropped                   | Test, typecheck and build pass; format fails only on `.mcp.json`. One test replaced: "reserves an inspector column" (the empty aside is gone; the panel tests cover the column)                                                    |
| 2   | Selecting opens the panel; closing removes only `item` | `ItemInspector.test.tsx`: open from `?item`, close keeps `layout`, mobile sheet close. Selection by click is covered by `LibraryView.test.tsx`. Label pages share `LibraryView`, so `/labels/<id>?item=` uses the same code path   |
| 3   | Bad ids show "Not found", reveal nothing               | Backend: `items.detail` returns `null` for foreign, missing, malformed and deleted ids. Web: "Not found" notice with the list still usable                                                                                         |
| 4   | Add/remove label updates rows and label view           | Mutation calls and state-follows-query tested with mocks. The row and label-view update through reactive queries: **manual check against dev Convex, pending**                                                                     |
| 5   | Delete removes item, links and runs; caps refuse       | Backend tests: cascade, other items/owners untouched, foreign/missing/unauthenticated rejected, over-cap deletes nothing, item gone from `items.list` and label lists. Web: cancel, Escape, confirm, failure, no "Not found" flash |
| 6   | Whitespace verbatim, text never HTML, safe link        | Tests: note text equals stored text with `whitespace-pre-wrap` and no parsed markup; open-original absent for notes and for non-http(s); `target="_blank"` and `rel="noopener noreferrer"`                                         |
| 7   | Inline at 1440px, overlay below 1280px, 390px          | Overlay focus and Tab trap, inline no focus steal, mobile sheet: tested with mocked media queries. **Visual check at 1440px, 1024px and 390px: manual, pending**                                                                   |
| 8   | Accessibility                                          | Labelled complementary region with an `h2`, named controls, alerts and "Item deleted" toast tested. **axe is not installed (new dependency, not added); Lighthouse at least 95: manual, pending**                                  |

## Backend changes (approved by the spec)

- `items.detail({ id: string })`: safe read, fields listed in `docs/core-concepts.md`.
- `items.remove({ id })`: atomic, capped at 500 label links and 100 runs, deletes stored assets.
- `itemLabels.listForItem` and `availableLabels` clamp pages to 10. No schema or index change.

## Spike findings

See the "Spike findings" section of `tasks/plan.md`: `c-sidebar-4` is a demo of the installed `sidebar` primitive. The
inspector uses it with `side="right"`, its own provider, and three opt-in additions to `sidebar.tsx` (controlled mobile
sheet, Ctrl/Cmd+B opt-out, mobile width).

## Deviations from the spec and plan

- Overlay (768 to 1279px) is not a modal dialog: it is the fixed sidebar container with the gap collapsed, plus our own
  focus move and Tab trap in `ItemInspector.tsx`. Below 768px the primitive's `Sheet` handles focus.
- Opening and closing pass `resetScroll: false` so the list keeps its scroll position.
- The panel content uses the `dark-sidebar` token scope so buttons match the dark panel.
- Added `popover` and `checkbox` to `packages/ui` with `shadcn add` (no new dependency).
- While a delete is in flight the panel hides its "Not found" notice, so the reactive query cannot flash it.
- The sheet's own `sr-only` "Close" button still exists next to ours (hidden by CSS on mobile).

- "Item deleted" is a visible sonner toast (new dependency `sonner`, approved by the user) instead of a hidden
  `role="status"`; sonner's own live region announces it.
- Final review fixes: panel content keyed by item (no stale errors), transparent backdrop and focus move in overlay,
  focus falls back to `#main` after a delete, the spec's "Not found" text, 24px remove targets, `mobileWidth="100%"`.
- Deferred: a future background worker must treat `NOT_FOUND` on a deleted item as normal (`processingRuns.start/finish`).

## Open manual checks

1. 1440px (inline, grid becomes two columns), 1024px (overlay) and 390px (full width, no horizontal scroll), against design section 02.
2. Add and remove a label in the panel; row tags and the label view change without a reload, on dev Convex.
3. Delete an item on dev Convex; it leaves the list and label views.
4. Lighthouse accessibility (at least 95) and a keyboard pass: Escape, Tab trap in overlay, focus back on the row.
5. A note near 100,000 characters scrolls inside the panel without freezing it.
