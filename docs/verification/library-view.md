# Library view verification

Date: 2026-10-07. Branch: `feature/web-shell` (uncommitted at the time of writing).
Spec: [SPEC-library-view.md](../../SPEC-library-view.md). Plan: `tasks/plan.md`.

## Automated

| Check                     | Result                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm test` (backend)     | 7 files, 45 tests pass (5 new: preview shape, label cap, ownership, 10-item clamp) |
| `pnpm test` (web)         | 11 files, 118 tests pass                                                           |
| `pnpm typecheck`          | 6 of 6 workspaces pass                                                             |
| `pnpm build`              | web, Chrome extension, and Android export build                                    |
| `pnpm format:check`       | Fails only on `.mcp.json`, committed earlier in `shadcn init` and untouched here   |
| Raw hex in `apps/web/src` | None                                                                               |

## Success criteria

| #   | Criterion                                                      | Evidence                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm check` passes, owed regression tests present             | Parts pass (see above); `format:check` fails only on the unrelated `.mcp.json`. The five owed draft cases are covered: reload restore, auth interruption, older save not erasing newer input, clear on success (`AuthGate.test.tsx`, pre-existing and still green) and failed-then-retried key reuse, verbatim whitespace (`CaptureBar.test.tsx`) |
| 2   | Link and multi-line note save, appear first, correct line      | `CaptureBar.test.tsx` (payload, verbatim whitespace), `LibraryView.test.tsx` (title, source, processing line, highlight of a new save). **User confirmed in the browser against dev Convex that saving works.** Storage of whitespace is checked at the payload, not in the database                                                              |
| 3   | Failed save retried creates one item; draft survives           | Same key is sent on retry (test); draft and key survive auth interruption and reload (`AuthGate.test.tsx`). Idempotency by key is the existing backend rule (`items.test.ts`). Offline retry against a real network was not run                                                                                                                   |
| 4   | Owner-only, label shows only its items, 10 per page, no dupes  | Backend tests: ownership, `exclude` labels, 10-item clamp; web tests: 10 requested per page, label view uses `listItemsForLabel`, rows keyed by `_id`. **User confirmed load more works in the browser**                                                                                                                                          |
| 5   | List and grid match design 02 at 1440px; 390px no h-scroll     | **User reported it looks great** (desktop). A recorded side-by-side at 1440px and a 390px pass are **manual, pending**                                                                                                                                                                                                                            |
| 6   | Layout and selection in the URL; keyboard operable             | Tests: toggle writes `?layout`, back/forward, invalid fallback, `?item` on click, `aria-current`, unknown id, rows are focusable anchors. Enter activation is native link behavior and was not driven in a test (no `user-event` dependency)                                                                                                      |
| 7   | Preview stays bounded                                          | By construction: page clamped to 10, `.take(4)` on `itemLabels`, at most 3 label gets. Tests assert the clamp, the label cap, and ownership; no test counts raw reads                                                                                                                                                                             |
| 8   | Accessibility: axe, Lighthouse at least 95, feedback announced | Capture feedback announced (`role="status"`/`alert` tests). **Lighthouse and axe on `/library` not run: manual, pending**                                                                                                                                                                                                                         |

## Backend change (approved)

`items.list` and `itemLabels.listItemsForLabel` now return `enrichmentStatus`, `captureSource`, `originalUrl`
(truncated to 512), up to three labels and `labelCount` (0 to 4). Both clamp pages to 10 (`items.list` allowed 100
before). No schema or index change. Existing consumers were only tests.

## Deviations from the spec and plan

- The capture bar also appears on label pages, as "shared by both routes" implies. A note saved there has no label,
  so it will not appear in that list.
- `labelCount` is capped at 4, so the `+N` overflow shows `+1` whenever there are four or more labels.
- A new save is highlighted until the next save or a reload; selecting another item does not clear it.
- Removed unused `confidence-meter` and `nav-item` from `packages/ui` (history keeps them). `source-chip` and
  `search-input` stay for `search-and-filters`. `LabelTag` states `suggested`, `manual` and `rejected` stay for
  `label-suggestions`; `manual` is used here for the `+N` tag.
- `ItemThumb` no longer uses `IconTile`; `ProcessingStatus` now takes `enrichmentStatus` values.
- `vitest.config.ts` now includes `.test.ts` files (previously only `.test.tsx`, which would have skipped
  `itemDisplay.test.ts`).

## Open manual checks

1. 1440px and 390px comparison with design section 02 (list, grid, empty, loading), including no horizontal scroll at 390px.
2. Lighthouse accessibility (at least 95) and axe on `/library`, signed in.
3. Offline save, then retry, against dev Convex: exactly one item.
