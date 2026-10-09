# Label boards verification

Status: **Implemented; authenticated desktop acceptance remains open.**

Verified on 2026-10-09 on `feature/boards`. Scope is Tasks 1–31 in
[todo.md](../../tasks/todo.md), with the contract in [SPEC-boards.md](../../SPEC-boards.md).
The implementation includes all feature slices (Tasks 1–29). An unchecked
acceptance entry means the combined claim still needs evidence, even when its
implementation and automated tests are present. Tasks 30–31 remain partially open.

## Automated evidence

`pnpm check` runs formatting, backend/web/extension tests, all workspace typechecks,
and web/mobile/extension builds. The final run passed: backend 277 tests, web 312 tests, extension 113 tests
(702 total), six workspace typechecks and three application builds. Formatting
and diff checks passed; the design export remains ignored.
Focused RED/GREEN tests were run during implementation; the full suite covers:

- Lazy owned opening, empty initial placement, repeated opening, anonymous/foreign
  rejection, 55-element paginated layout and independent viewport revision.
- Atomic outside-item inclusion/placement, retry receipts, identity payload
  conflicts, stale and expired retry rejection, rollback, removal preserving
  content, and independent geometry for one item on two label boards.
- Shared capture/manual membership attribution and existing capture, Reddit,
  item-state, processing, web and extension regressions.
- Membership remove/re-add generation races, stale restore rejection, immediate
  read filtering, and bounded cleanup across 24 boards on item deletion.
- Bounded stored/external media previews and sparse chronological tray pages.
  Search uses relevance; label review checks the matching membership link.
- Typed label-only Board URLs, library/inbox layout normalization, existing shell
  and library controls, complete initial loading and open retry.
- Coordinate conversion, media/text region resizing (including top/left origin),
  plain-text note drafts/recovery, columns and restored free dimensions,
  same-column reorder, container-only preservation, headings and edge controls.
- Deduplicated group movement/removal, detachment without the selected container,
  100-entry history, inverse operations and board-only undo semantics.
- Serialized requests, acknowledged save status, ambiguous identical retries,
  old reactive echoes, real membership rebasing of queued edits, external-session
  history invalidation, conflicts, and explicit rejected-action reload recovery.
- Background read failures preserve the mounted editor. Tray/preview failures are
  contained locally with Retry loading. Pending layout or viewport writes guard
  route/tab departure; inspector/filter changes within the same board remain usable.

A fresh reviewer found ten Important correctness issues in the session/UI;
all were repaired with regression coverage. No minor findings were deferred.
Further integration repairs bound incident edges across the entire atomic action,
validate remembered region heights and detach selected children on group movement.
The 102-edge removal test proves transactional rollback.

## Collaborative browser evidence

T3 preview was used first (`preview_status`, then `preview_open`). The real app at
`http://localhost:5173/library` rendered its signed-out screen. Sign-in was requested
through the shared preview; no authenticated session was available during this run.
No account, credentials or impersonation were created.

The [typed development fixture](../../apps/web/test-fixtures/boards.tsx) uses actual
`BoardCanvas`, custom nodes/edges, `BoardSession` and `LibraryTray` components with
synthetic content, local SVG media and a 40ms mocked mutation acknowledgment.
It does **not** exercise Clerk, Convex transport, the actual label route, inspector,
note transaction, live filtering or cloud persistence. It is served by Vite at
`/test-fixtures/boards.html`, and is not a production build entry.

At 1440×900: checked 60px rail sizing, 24px grid, 36px tools, equal default
120px text regions, cropped media, curved connections, viewport controls, tray
and placement/Locate indicators. At 1100×760: no document horizontal overflow;
tools stay inside the 426px-high canvas (toolbar top110/bottom424, canvas top54/
bottom480). Toolbar centering was repaired after the smaller-desktop check.
Theme/fonts reuse the app tokens recorded in [the design reference](../design/boards.md).
The fixture rail/header are illustrative: actual rail routing and inspector still
need the authenticated check.

Browser artifacts, retained locally by T3:

- 1440×900 final fixture: `/home/martin/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv1cu33d-18d63fcc.png`.
- 1100×760 fixture: `/home/martin/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv1clof4-24b15378.png`.

At 80% zoom with viewport translation (138,56.6), a synthetic drop at screen
(700,300), below the 54px header, produced canvas (627.5,236.75). Exactly one
mocked layout request was sent. Toolbar Undo removed that placement; Redo restored
it, with one request per action. Zoom alone sent zero layout requests. A synthetic
top-left handle resize moved card0 from (160,120) to (120,100), widened it from 300
to 340 and scaled the combined regions to 212.5/127.5; zero requests were sent
during resizing and one on release. Native click selected the card/edge and
opened the edge controls. Changing arrowheads and committing an edge label sent
one request per action; `<b>Research</b>` rendered literally with zero bold tags. Resize handles were aligned to the measured 9px accent
squares after the visual check. These remain mocked-transport checks.

## Performance measurement

Reproduce with `pnpm dev:web`, open
`http://localhost:5173/test-fixtures/boards.html?count=100` at 1440×900, wait for load
and then evaluate `await window.__fixture.measure()` in the preview. The
[measurement source](../../apps/web/test-fixtures/measureBoard.ts) collects rAF
intervals for five seconds of synthetic wheel pan and five seconds of mouse drag,
then releases the drag and waits 600ms for acknowledgment. Reload between runs.
The fixture contains 100 cards (50 with media, 50 text), 10 ordered columns and
100 connections. No real library query runs. This is a browser measurement with
mocked transport; it is not native trackpad or authenticated network evidence.

Environment: Linux desktop, Intel Core i5-1035G1, 8 logical CPUs; Intel Iris Plus
G1 and NVIDIA GTX1050 Max-Q available (active compositor GPU not established).
T3 Code 0.0.45, Electron44.4.2 / Chrome152.0.7977.130, reported deviceMemory8GiB,
Vite development build, localhost, no network throttling, local SVG media and
40ms mocked acknowledgments. Other desktop applications remained running.

| Run                                   | Rendering        | Frames | Overall p95 |      Drag p95 | Maximum interval |
| ------------------------------------- | ---------------- | -----: | ----------: | ------------: | ---------------: |
| Initial (tests running; confounded)   | All elements     |    147 |       200ms | Not separated |         1433.2ms |
| Follow-up                             | All elements     |    506 |      33.4ms |          50ms |          300.1ms |
| Controlled baseline (checks finished) | All elements     |    524 |      33.3ms |        33.4ms |          316.7ms |
| Visible-elements run                  | Visible elements |    593 |      16.8ms |        16.8ms |          133.3ms |
| Reproducible fixture repeat           | Visible elements |    591 |      16.8ms |        16.7ms |          166.7ms |
| Final same-fixture comparison         | Visible elements |    592 |      16.7ms |        16.7ms |          166.6ms |

React Flow's installed `onlyRenderVisibleElements` option reduces offscreen
rendering while retaining all records in the canvas store. The repeat rendered
17 nodes and 21 edges for the current viewport, from 110 nodes/100 connections.
The measured p95 meets the approved 33ms target; maximum intervals show occasional
long frames, so this does not claim every frame is below budget. The optimization
is retained because the repeated improvement exceeds observed baseline variation.

Each controlled run sent zero layout requests throughout pan and drag pointer
movement, and one on drag end. Viewport callback count was one. In the actual
editor that callback schedules a separate 500ms debounced viewport mutation;
fixture counters are callbacks, not cloud viewport-write measurements.

## Query and transaction costs

Layout assembly reads bounded pages of at most 50 rows/512KiB and publishes only a
complete matching revision; revision changes cancel/restart loading. Placed media
previews are batches of 20, with bounded title/body and at most four labels.

Chronological label browsing scans at most20 owner-item candidates/2MiB per page,
then checks the indexed label link for each candidate. This preserves **item
creation chronology** rather than assignment time. Sparse labels may need many
pages, including empty nonterminal pages; the original continuation/split metadata
is preserved and Load more remains available. This bounded scan has no mandatory
backfill but is deliberately less efficient for very sparse labels. All-library
source/review browsing uses existing owner indexes; search uses existing search
indexes and relevance order. The client never collects the whole library.

A request is limited to 100 operations/affected element keys and 100 affected
connection keys, plus 512KiB. Column children and incident edges have independent
bounded indexed reads. Oversized cascades reject the whole transaction. Receipt
retention is seven days with indexed bounded cleanup. These are atomic-action
limits, not a 100-card board limit.

## Remaining acceptance checks

- [ ] Sign in and exercise actual label List → Board → Grid, direct URL, reload,
      browser back/forward, rename and narrow-screen fallback.
- [ ] Verify real tray search/source/review/label pagination and persisted
      collapse/height preferences with existing items and a sparse label.
- [ ] Drop an outside item and create whitespace-preserving/URL-looking notes;
      inspect actual library content/membership and reopen the saved board.
- [ ] Use native pointer/trackpad pan/pinch and resizing at several zoom levels;
      reorder/move cards between columns, detach, create notes in columns and reopen.
- [ ] Connect actual endpoints, edit arrow/label/color settings, move/resize cards,
      then verify real inspector overlay and persistence.
- [ ] Multi-select/group/remove and keyboard undo/redo column deletion, card/edge
      removal, note placement and outside-item placement; confirm library data remains.
- [ ] Use two authenticated owner sessions, offline/lost acknowledgment recovery,
      pending viewport navigation and cleanup remove/re-add races against live transport.
- [ ] Repeat the performance fixture with representative fetched media and
      authenticated transport; record cloud query/write counts separately.

Backend tests and mocked UI evidence support these implementations but do not
close the above live checks. Archived Reddit gaps are unchanged. Production
publishing, merge and push were not performed.

## Execution rulings

The implementation request approved the plan defaults. Backend storage and
dependency/type-generation checks were grouped because generated API types were
needed to typecheck the first storage tests. Indexed cleanup uses cursor
continuations so new valid generations cannot starve older stale rows. Columns
persist absolute application coordinates with pure stack layout, keeping React
Flow parent internals out of storage. Tasks exceeding five files were split into
feature, shared-contract, composition or repair slices. The existing shared
checkout was retained for T3 preview access. `.mcp.json` received formatting only
to allow the existing repository-wide check to run. No deferred minor review
findings remain.

## Missing-function deployment repair (2026-10-09)

A user opening the actual Board view received `Could not find public function for
boards:open`. Both frontend and backend configuration pointed to development
deployment `graceful-stork-346`; its live function metadata contained 36 functions
and no board functions. Earlier `convex codegen` completed successfully but did
not deploy them. Its component-upload progress was incorrectly treated as a
completed deployment. Installed Convex 1.46.0 CLI source explicitly defines
codegen as read-only. The prior automated/mocked checks did not detect this gap.

After classifying the development target, `pnpm --filter @mindspool/backend exec
convex dev --once` completed successfully. A new `convex function-spec` read listed
46 deployed functions, including public `boards.js:open`, board reads, viewport
mutation, operation mutation, tray/previews and internal cleanup. A direct
unauthenticated HTTP probe with an intentionally invalid label ID reached the
argument validator; it no longer returned function-not-found and created no data.
This verifies deployment availability, not authenticated Board behavior.

The README now distinguishes type generation from deployment and records the
watch/one-shot development sync and live function-metadata check. Use that live
check after backend changes before declaring integration ready. Remaining
authenticated acceptance items above are still open.
