# Implementation Plan: library-view

Spec: [SPEC-library-view.md](../SPEC-library-view.md) (open questions resolved; backend preview extension approved).
Capability map: [CAPABILITY-MAP-web-redesign.md](../CAPABILITY-MAP-web-redesign.md), module 2 of 7. The web-shell plan and
tasks are archived in `tasks/archive/web-shell-*.md` (its T9 manual browser checks are still pending there). Tasks:
[todo.md](todo.md).

## Overview

Rebuild saving and browsing in the Modernist design: a capture bar, a paginated list or grid of the owner's items, and the
same view filtered to one label, mounted into the web-shell routes `/library` and `/labels/$labelId`. Saving is instant and
never loses input. The module also pays the regression debt from the web-shell rewrite (failed-then-retried save,
whitespace preservation, capture-key reuse).

## Architecture Decisions

- **Backend first, small.** The preview extension (`enrichmentStatus`, `captureSource`, `originalUrl`, up to 3 labels,
  `labelCount`) is the only backend change and every row depends on it, so it is T1. A shared `previewItems` helper joins
  labels for both `items.list` and `itemLabels.listItemsForLabel`, so one set of bounds applies. Both queries clamp the page
  to 10 (`items.list` currently allows up to 100).
- **Label join bounds:** per item one `by_owner_item_decision` read with `.take(4)` (3 shown, the fourth only proves overflow,
  so `labelCount` is 0 to 4 and the UI shows `+N` for N = `labelCount - labels.length`), then at most 3 label gets. Worst case
  per page: 10 items, 40 `itemLabels` rows, 30 label documents.
- **Pure display logic first:** `itemDisplay.ts` (title, host, kind, relative date, URL detection) has no React or Convex
  dependency, so capture and rows both build on tested pure functions. Relative dates take an injected clock.
- **One draft model:** the existing `captureDraft` stores `inputType`; the spec decides URL versus note at save time from the
  trimmed value. T3 reconciles this (drop the stored type or derive it) while keeping the draft and key tests green.
- **Capture before list.** The capture bar needs only `items.create` and the draft context, so it ships (T3) before the list
  exists; the list (T5) then shows saved items. This puts the data-loss-sensitive path early (fail fast).
- **Shared view, thin routes:** `LibraryView` takes a source (`all` or `labelId`) and owns heading, capture bar, layout
  toggle, list or grid, pagination. The two routes only choose the query and heading. Selection and layout are typed search
  params (`validateSearch` in `search.ts`), no store.
- **`packages/ui` mindspool components:** adapt `ItemRow`, `ItemCard`, `ItemThumb`, `LabelTag`, `SegmentedControl`,
  `ProcessingStatus` and the ReUI `badge` in the same task that first uses them (T4); remove the ones no module uses
  (`confidence-meter`, `search-input`, `source-chip`, `nav-item` are decided in T9 against actual imports, since
  `search-and-filters` may want `search-input` and `source-chip`: keep those two and note it).
- **Brand icons** are wrapped SVG imports rendered with `currentColor` (`BrandIcon.tsx`); no dependency added.
- **Not in this module:** inspector, counts, source chips, "Needs review", search, image upload, retry for failed extraction.

## Dependency Graph

```
T1 backend preview extension ────────────────────────────┐
T2 itemDisplay + BrandIcon + search params (pure) ──┬────┤
                                                    │    ├─ T5 list + route wiring (both routes) ─ T6 grid + layout toggle
T3 capture bar + draft regression tests ────────────┘    │            │
T4 adapted ui components (row/card/thumb/tag/status) ────┘            ├─ T7 states, a11y, responsive
                                                                      └─ T8 selection (?item) and keyboard
                                                                                 └─ T9 cleanup + verification
```

T1, T2, T3 and T4 are independent of each other. T3 needs only T2's URL detection (its first sub-step). T5 needs T1, T2,
T4. T6, T7, T8 are independent after T5.

## Risks and Mitigations

| Risk                                                                                             | Impact | Mitigation                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Draft and capture-key regressions while reworking the draft model (inputType removed or derived) | High   | T3 writes the owed regression tests against the existing hook first, confirms green, then changes the model           |
| Label join makes list reads unbounded or N+1 slow                                                | High   | T1 enforces `.take(4)` and 3 gets, with a test asserting the caps; clamp page to 10 in both queries                   |
| Existing tests/consumers assume the old preview shape or 100-item pages                          | Med    | Preview fields are additive; grep for `items.list` and `listItemsForLabel` consumers in T1; update tests deliberately |
| `usePaginatedQuery` live updates reorder or duplicate rows when an item is saved                 | Med    | T5 test with a mocked growing page; key rows by `_id`; manual check in T9 against dev Convex                          |
| Tombstoned (`exclude`) or foreign labels leaking into tags                                       | High   | Query only `manualDecision: "include"` through `by_owner`-scoped index; T1 ownership and tombstone tests              |
| Typed search params and the generated route tree fight `Link to="." search`                      | Med    | T2 adds `validateSearch` and a router test for round-trip; T5 uses it first                                           |
| Brand SVGs imported as URLs cannot take `currentColor`                                           | Low    | Check the Vite config in T2 (`?react` loader or inline `?raw`); fall back to hand-written path components             |
| Relative dates flake in tests                                                                    | Low    | Single clock function injected into `itemDisplay` and mocked with fake timers                                         |
| Grid or row layout drifts from design section 02                                                 | Low    | Side-by-side check at 1440px and 390px in T9; record in `docs/verification/library-view.md`                           |

## Checkpoints

- After T4: `pnpm check` green; capture saves a link and a note against dev Convex; backend preview bounded; display
  components compile. Review with human.
- After T6: `/library` and `/labels/<id>` show list and grid with load more. Review with human.
- After T9: all spec success criteria met; manual 1440px/390px checks recorded.

## Open Questions

None blocking. Two points assumed in this plan, flagged for the plan review:

1. `labelCount` semantics: 0 to 4, capped (a fourth label only signals overflow, so the row shows `+1` at most when exactly
   four exist, and `+1` also when many more exist). The spec's wording, "count capped at 4 → shown as `+N`", is followed
   literally; say so if the exact overflow number matters.
2. `source-chip` and `search-input` are kept in `packages/ui` for `search-and-filters` rather than removed, even though this
   module does not use them. Say so if you would rather delete them now.
