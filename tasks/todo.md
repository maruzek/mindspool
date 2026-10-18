# Tasks: Visual Web Clipper

Status: **Task 0 in progress; product implementation has not started.**
Spec: [SPEC-visual-web-clipper.md](../SPEC-visual-web-clipper.md).
Plan and shared interfaces: [plan.md](plan.md). Read both before execution.
The previous completed MCP task list is [archived](archive/mcp-discovery-todo.md).

Each task starts with the meaningful failing tests named below, implements the
smallest passing slice, and finishes with the stated verification. Documentation
and feasibility tasks use evidence rather than artificial unit tests. File lists
include adjacent tests; if execution needs more than five files, split the task
before expanding it. Worktree/branch setup occurs at execution, not during planning.

## Phase 1: Prove the foundations

### Task 0: Resolve browser and upload feasibility

- [ ] Complete Task 0.

Progress (2026-10-18): Sharp 0.35.5 is pinned and the real development-runtime
decode/marker/recovery probe passed, including a two-page storage scan. The
Chrome test build passed viewport and scroll/stitch capture after popup closure.
Desktop Firefox and native image-menu checks remain pending. Run
`node scripts/probe-visual-clipper.mjs`; exact steps and limitations are in
[the verification report](../docs/verification/visual-web-clipper.md).
The task and downstream gate remain unchecked until the missing evidence exists.

**Description:** Produce disposable probes and evidence for the risky decisions
before committing to implementation; review the capture-first popup brief.

**Acceptance criteria:**

- [ ] Prove viewport capture, canvas processing after popup close, context-menu
      invocation, and a sticky-header scroll/stitch fixture in both real browsers;
      record versions and supported processing adapters. Verify the proposed limits.
- [ ] Prove the private Convex upload/Node decoder can fully decode a small raster,
      reject a disguised/truncated raster, preserve/recover the attempt marker after
      an injected post-store crash, and safely retain attached assets during cleanup.
- [ ] Record the pinned Sharp version/build requirements, precise additional
      permissions, and popup layout review. Any failed architecture assumption is
      corrected in the plan before downstream tasks; do not silently drop guarantees.

**Verification:** Review evidence in `docs/verification/visual-web-clipper.md`;
check both fixture images and `_storage` recovery results. Classify any deployment
target first. No production probe. Disposable code is not production implementation.

**Dependencies:** Human plan review.

**Files likely touched:** `docs/verification/visual-web-clipper.md`, `tasks/plan.md`,
`packages/backend/package.json`, `pnpm-lock.yaml`. Pin the reviewed decoder dependency
as part of the runtime proof; temporary probes stay outside tracked product files.

**Estimated scope:** Medium, up to four tracked files.

### Task 1: Define capture vocabulary and additive storage shape

- [ ] Complete Task 1.

**Description:** Define the shared context/kind/limits and backend validators so
all new capture paths agree without changing existing item inputs.

**Acceptance criteria:**

- [ ] Export the plan's `CaptureContext`/`VisualCaptureKind` and exact byte/pixel
      constants; reject unsafe URLs, excessive metadata, and invalid timestamps.
- [ ] Add optional item `visualCapture` metadata and the `visualCaptures` session
      table/indexes. Store authoritative dimensions, provenance and kind separately
      from generic thumbnails. Legacy rows remain readable without migration.
- [ ] Existing `items.create` remains external-asset-only; contracts distinguish
      transport bytes, server-owned storage references, and public item metadata.

**Verification:** `pnpm --filter @mindspool/schema test`; schema/backend
typechecks; legacy item fixtures pass. Generate types only against a classified
authorized development target when required; generated declarations belong here.

**Dependencies:** Task 0.

**Files likely touched:** `packages/schema/src/visualCapture.ts`,
`packages/schema/src/visualCapture.test.ts`, `packages/schema/src/index.ts`,
`packages/backend/convex/validators.ts`, `packages/backend/convex/schema.ts`.
Export the new shared vocabulary through the existing schema package entrypoint;
keep backend-only session validators in `validators.ts`.
Split generated API changes into the first function-owning task if none arise here.

**Estimated scope:** Medium, five files.

### Task 2: Create owned capture sessions

- [ ] Complete Task 2.

**Description:** Introduce begin/status/cancel and private attempt transitions
with authenticated identity and stable retry behavior.

**Acceptance criteria:**

- [ ] `visualCaptures.begin/status/cancel` follow the plan's signatures;
      owner/key duplicates replay, conflicting contexts fail, foreign/missing
      sessions are indistinguishable, and receipts outlive active uploads.
- [ ] Private lease/attempt transitions serialize uploads and cancellation;
      expired/stale attempts cannot attach files or modify a completed capture.
- [ ] Tests cover two owners, simultaneous begin/retry, cancel-before-upload,
      completed-session cancel, and reuse of a deleted completed capture key.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/visualCaptures.test.ts`;
`pnpm --filter @mindspool/backend typecheck` after code generation if needed.

**Dependencies:** Task 1.

**Files likely touched:** `packages/backend/convex/visualCaptures.ts`,
`packages/backend/convex/visualCaptureState.ts`,
`packages/backend/convex/visualCaptures.test.ts`,
`packages/backend/convex/_generated/api.d.ts`.

**Estimated scope:** Medium, four files.

### Checkpoint A: Foundations are viable

- [ ] Tasks 0–2 pass and browser/storage evidence is reviewed; no unresolved
      assumption is hidden behind permissive asset attachment or a missing browser.

## Phase 2: Save one viewport end to end

### Task 3: Receive and validate an owned raster upload

- [ ] Complete Task 3.

**Description:** Add the authenticated binary route and private decoder using
the reviewed staged-asset lifecycle.

**Acceptance criteria:**

- [ ] `POST /visual-captures/upload` authenticates the Clerk JWT and owned session,
      bounds the stream even with missing/false Content-Length, tags stored bytes
      with the recorded server attempt marker, and uses typed safe HTTP failures.
- [ ] Fully decode only static PNG/JPEG/WebP under the plan's pixel/frame limits;
      store server-derived dimensions and payload digest. Test exactly 2,097,152
      bytes versus one byte over, forged MIME, huge dimensions, and truncated input.
- [ ] The Node decoder dependency is pinned; session/lease guards reject stale,
      foreign or conflicting attempts. New APIs accept no client storage IDs.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/visualCaptureUpload.test.ts`;
backend typecheck; actual Node runtime decode on the authorized development target.

**Dependencies:** Task 2; Task 0's dependency/runtime proof.

**Files likely touched:** `packages/backend/convex/visualCaptureUpload.ts`,
`packages/backend/convex/visualImageDecode.ts`,
`packages/backend/convex/visualCaptureUpload.test.ts`,
`packages/backend/convex/_generated/api.d.ts`. The decoder dependency was pinned
in Task 0. Route export is wired in Task 4 to retain the file budget.

**Estimated scope:** Medium, four files.

### Task 4: Finalize durable items and reclaim abandoned uploads

- [ ] Complete Task 4.

**Description:** Expose the route and finalize verified assets into ordinary
owned library items, with recurring safe cleanup.

**Acceptance criteria:**

- [ ] Implement `visualCaptures.finalize` and the internal `insertVisualCapture`
      writer: verified owned asset attachment, item insertion, session completion,
      and receipt update are transactional; retry returns the same item.
- [ ] A five-minute maintenance job expires unfinished one-hour sessions, scans
      at most 50 system-storage rows per page with cursor wraparound,
      and cleans crash/late-write orphans without touching completed/foreign/legacy files.
- [ ] Wire the HTTP route with scoped CORS where needed, existing processing hooks,
      and normal item deletion cleanup. Completed receipt replay cannot recreate
      a user-deleted item. Capture has no board placement side effect.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/visualCaptures.test.ts`;
backend typecheck; inject post-store and post-finalize response loss, run maintenance,
then assert one item, no abandoned file and intact finalized visuals.

**Dependencies:** Task 3.

**Files likely touched:** `packages/backend/convex/visualCaptures.ts`,
`packages/backend/convex/visualCaptures.test.ts`, `packages/backend/convex/http.ts`,
`packages/backend/convex/crons.ts`, `packages/backend/convex/_generated/api.d.ts`.
The internal writer and bounded maintenance functions live in `visualCaptures.ts`;
do not weaken `libraryWriters` validation. Split maintenance into its own reviewed
task if this module exceeds a focused-session scope.

**Estimated scope:** Medium, five files.

### Task 5: Capture and save the visible webpage

- [ ] Complete Task 5.

**Description:** Deliver the first complete viewport-to-library path through a
trusted background operation and cross-browser processor adapter.

**Acceptance criteria:**

- [ ] Background creates one intent key, pins tab/window/document, captures the
      current viewport, encodes with the bounded ladder, and invokes begin/upload/finalize.
      Reject navigation/tab races; never capture a different tab as a fallback.
- [ ] Processor adapter works after popup close in both browsers; manifest adds
      only the reviewed capture/processor/HTTP-origin permissions. Raw pixels and
      tokens never enter a page-origin script or synchronized storage.
- [ ] Test operation sequencing, codec/size failure, concurrent screenshot cadence,
      signed-out save, and response-loss retry. Existing social handlers still work.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/visualCapture.test.ts`;
extension typecheck and both builds. Trigger the real operation from the extension
runtime in both browsers; verify stored pixels and library item.

**Dependencies:** Task 4.

**Files likely touched:** `apps/extension/src/visualCapture.ts`,
`apps/extension/src/visualCapture.test.ts`, `apps/extension/entrypoints/background.ts`,
`apps/extension/entrypoints/processor.html` (WXT page entry with self-contained module),
`apps/extension/wxt.config.ts`.
Keep initial processor/transport helpers together; split them only as later tasks need it.

**Estimated scope:** Medium, five files.

### Checkpoint B: First working visual save

- [ ] Tasks 3–5 pass; one real viewport capture is stored and inspectable in each
      browser, retries are idempotent, and failure cleanup is proven.

## Phase 3: Make everyday capture accessible

### Task 6: Connect the popup to shared project styling

- [ ] Complete Task 6.

**Description:** Replace copied theme values with shared CSS/tokens and prepare
the extension build to render the project's existing UI components correctly.

**Acceptance criteria:**

- [ ] Popup imports shared theme styles and appropriate shared buttons/icons;
      Tailwind discovers extension and shared components without a second theme.
- [ ] Preserve Archivo, semantic colors, zero-radius controls, borders/shadows,
      focus states and compact sizing; remove obsolete duplicate popup styling.
- [ ] Both browser builds render the shared controls without missing classes,
      font/CSP errors, or changes to the web app's existing theme.

**Verification:** Both extension builds and extension typecheck; inspect a popup
beside MindSpool in both browsers. No implementation-mirroring theme unit test.

**Dependencies:** Task 5.

**Files likely touched:** `apps/extension/entrypoints/popup/style.css`,
`apps/extension/wxt.config.ts`, `apps/extension/package.json`, `pnpm-lock.yaml`.
If the existing build requires the Tailwind plugin, reuse the pinned web version;
record it as the plan's build-only dependency, not a new product UI library.

**Estimated scope:** Medium, four files.

### Task 7: Deliver the simplified capture-first popup

- [ ] Complete Task 7.

**Description:** Implement the plan's popup hierarchy with viewport capture
working and later modes unavailable until wired.

**Acceptance criteria:**

- [ ] Signed-in UI leads with visible-area capture and secondary region/full-page
      actions; account/link controls are compact. No board picker or setup paragraphs.
- [ ] Show auth/loading/unsupported/progress/saved/error/retry states accessibly;
      reopening reads background status instead of restarting an intent.
- [ ] Keyboard order follows hierarchy; double-clicking during an active operation
      does not create duplicate captures. Completed-action repetition is a new intent.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/CapturePopup.test.tsx`;
extension typecheck; real popup keyboard and close/reopen checks in both browsers.

**Dependencies:** Task 6.

**Files likely touched:** `apps/extension/src/CapturePopup.tsx`,
`apps/extension/src/CapturePopup.test.tsx`, `apps/extension/entrypoints/popup/main.tsx`,
`apps/extension/src/visualCapture.ts`.

**Estimated scope:** Medium, four files.

### Task 8: Preserve rendered metadata and precise provenance

- [ ] Complete Task 8.

**Description:** Read bounded actual-page metadata and selected-example context;
prevent later enrichment from replacing the captured visual/context.

**Acceptance criteria:**

- [ ] Reuse `parseMetadata` fallback order via a bounded page-head representation,
      respecting capture validation lengths. Missing metadata still saves the visual.
- [ ] Preserve browsing URL/fragment separately from canonical, plus safe selected
      image, entry, design-site and X-post URLs only when unambiguous. No site branding guesses.
- [ ] Enrichment updates metadata/thumbnail without overwriting capture pixels,
      timestamp, source context, or existing manual decisions. Test generic aggregator
      metadata, SPA changes, expired blob URLs, and failed enrichment.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/pageContext.test.ts`;
`pnpm --filter @mindspool/backend exec vitest run convex/enrichment.test.ts`;
extension/backend typechecks.

**Dependencies:** Task 5; integrates with Task 7.

**Files likely touched:** `apps/extension/src/pageContext.ts`,
`apps/extension/src/pageContext.test.ts`, `apps/extension/src/visualCapture.ts`,
`packages/backend/convex/enrichment.test.ts`, `packages/backend/convex/processingRuns.ts`
(the existing run-settlement owner of enrichment metadata; modify only if tests show overwrite).

**Estimated scope:** Medium, up to five files.

### Checkpoint C: Everyday viewport capture

- [ ] Tasks 6–8 pass; popup hierarchy matches the project and a scrolled section
      saves the right pixels, source URL, metadata, and separate `og:image` context.

## Phase 4: Capture a detail or a particular image

### Task 9: Capture a user-selected rectangle

- [ ] Complete Task 9.

**Description:** Add explicit region selection and scaled cropping to the
shared save path, enabling the popup's selected-area action.

**Acceptance criteria:**

- [ ] Isolated-world overlay appears only after the action; pointer selection is
      clamped to the viewport. Escape/empty selection sends no capture upload.
- [ ] Remove overlay before capture, crop using measured screenshot-to-CSS ratios,
      and preserve the selected complete visual at non-default zoom/device scale.
- [ ] Abort on tab/document/viewport changes, restore focus/handlers, and test
      reversed drag, edges, cancellation, and rapid navigation.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/regionCapture.test.ts`;
both builds; real rectangle capture at 80%, 125%, and high-DPI scale in both browsers.

**Dependencies:** Task 8.

**Files likely touched:** `apps/extension/src/regionCapture.ts`,
`apps/extension/src/regionCapture.test.ts`, `apps/extension/src/visualCapture.ts`,
`apps/extension/entrypoints/processor.html`, `apps/extension/src/CapturePopup.tsx`.

**Estimated scope:** Medium, five files.

### Task 10: Save an image from its native context menu

- [ ] Complete Task 10.

**Description:** Register the native image action and obtain the selected image
without hover affordances or surrounding-feed capture.

**Acceptance criteria:**

- [ ] One image-context action uses the browser-supplied target and matching local
      context; menus survive restart/reinstall without duplicates. No injected image UI.
- [ ] Use readable selected pixels or bounded credential-free fetch with optional
      origin permission; reject ungranted redirects/unsupported frames/tainted
      canvas and offer screenshot capture. Image CORS failure cannot substitute `og:image`.
- [ ] Persist the static canonical image through the shared upload path; correctly
      handle responsive/CSS-cropped images, X attachments, repeated image URLs on
      multiple cards, alpha, animation-as-still, permission denial, and 16 MiB/timeout limits.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/imageCapture.test.ts`;
both builds; native image right-click acceptance on an aggregator and X in both browsers.
Badge/popup status must expose failure and retry without leaving a page overlay.

**Dependencies:** Task 8; Task 9's selection changes must be integrated before background edits.

**Files likely touched:** `apps/extension/src/imageCapture.ts`,
`apps/extension/src/imageCapture.test.ts`, `apps/extension/entrypoints/background.ts`,
`apps/extension/src/visualCapture.ts`, `apps/extension/wxt.config.ts`.

**Estimated scope:** Medium, five files.

### Checkpoint D: Targeted captures work

- [ ] Tasks 9–10 pass in both browsers; region and actual-image capture preserve
      the intended visual, no hover UI exists, and permission failures are understandable.

## Phase 5: Bounded full-page capture and recovery

### Task 11: Control full-page scrolling safely

- [ ] Complete Task 11.

**Description:** Add page measurement, tile positions, sticky/fixed handling,
stability guards, and self-restoration for finite full-page capture.

**Acceptance criteria:**

- [ ] Plan tile offsets within 30 seconds/40 tiles/24 million pixels/32,000px
      height; serialize screenshots at least 600ms apart. Detect incompatible extent,
      width, scroll, tab/document, or device-scale changes.
- [ ] Preserve page overlays in the initial capture, suppress only repeated fixed/
      sticky layers in subsequent tiles, and restore exact temporary styles/scroll
      in all exit paths with a page-side watchdog if the worker dies.
- [ ] Tests cover short/long pages, last overlapping tile, sticky header, lazy
      growth, infinite growth, nested-scroll refusal, cancellation, and watchdog expiry.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/fullPageCapture.test.ts`;
both-browser fixture checks before wiring the popup action.

**Dependencies:** Tasks 9–10.

**Files likely touched:** `apps/extension/src/fullPageCapture.ts`,
`apps/extension/src/fullPageCapture.test.ts`,
`apps/extension/src/__fixtures__/capture-page.html`,
`apps/extension/src/__fixtures__/growing-page.html`.

**Estimated scope:** Medium, four files.

### Task 12: Stitch and save the complete supported page

- [ ] Complete Task 12.

**Description:** Use actual offsets/scales to stitch captured tiles and enable
the popup's full-page action through the normal encoded upload flow.

**Acceptance criteria:**

- [ ] Stitch without gaps/duplicate overlap at measured pixel positions, preserving
      page width and the final bottom edge; free tile/canvas memory as work completes.
- [ ] Encode within 2 MiB and quality floors. Limit failures explicitly offer
      viewport/region capture; partial output is never reported as full-page success.
- [ ] Tests cover tall-page scaling, noninteger DPR, short final tile, timeout,
      encoding failure and cleanup; a real supported fixture matches in both browsers.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/fullPageStitch.test.ts`;
both builds; visually inspect complete stored output and restored source page.

**Dependencies:** Task 11.

**Files likely touched:** `apps/extension/src/fullPageStitch.ts`,
`apps/extension/src/fullPageStitch.test.ts`, `apps/extension/entrypoints/processor.html`,
`apps/extension/src/visualCapture.ts`, `apps/extension/src/CapturePopup.tsx`.

**Estimated scope:** Medium, five files.

### Task 13: Recover operation status and network retries

- [ ] Complete Task 13.

**Description:** Make popup/worker interruption explicit without duplicate
items, stranded page modifications, or persistent raw-pixel storage.

**Acceptance criteria:**

- [ ] Persist small operation metadata/status in extension storage and encoded
      retry payload in extension-origin IndexedDB for at most one hour; never tokens
      or unencoded full-page tiles. Remove payload after success/cancel/expiry.
- [ ] Reopening/status after worker restart reconciles server state; replay the
      same encoded intent key or report interruption. Do not silently recapture a
      changed page under an old key. An explicit new capture gets a new key.
- [ ] Test upload timeout before/after server success, restart at each phase,
      concurrent attempts, sign-out during upload, and cancellation racing finalize.

**Verification:** `pnpm --filter @mindspool/extension exec vitest run src/captureRecovery.test.ts`;
extension typecheck; suspend/restart real background contexts and reopen the popup
in both browsers. Assert one saved item and restored original-page state.

**Dependencies:** Task 12.

**Files likely touched:** `apps/extension/src/captureRecovery.ts`,
`apps/extension/src/captureRecovery.test.ts`, `apps/extension/src/visualCapture.ts`,
`apps/extension/entrypoints/background.ts`.

**Estimated scope:** Medium, four files.

### Checkpoint E: All capture modes are complete

- [ ] Tasks 11–13 pass; both browsers capture a complete supported finite page,
      recover safely from interruption, and report unsupported/oversized pages honestly.

## Phase 6: Use the visuals on the existing board

### Task 14: Expose owned visual metadata to display surfaces

- [ ] Complete Task 14.

**Description:** Extend bounded item/detail/board read projections with the
metadata needed for complete-image display and provenance.

**Acceptance criteria:**

- [ ] Return optional kind/dimensions/source context alongside existing primary
      stored-image URLs; preserve legacy item return shapes through optional fields.
- [ ] Projection queries remain owner-scoped and bounded; neither uploaded IDs
      nor temporary source blob URLs become unvalidated public links.
- [ ] Tests cover correct primary visual after enrichment, legacy fallback,
      foreign detail/board reads, and two separate captures from the same URL.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/visualCaptureReads.test.ts`;
backend and web typechecks; existing item/board query tests.

**Dependencies:** Tasks 4, 8; execute after Task 13 in the default sequential order.

**Files likely touched:** `packages/backend/convex/validators.ts`,
`packages/backend/convex/items.ts`, `packages/backend/convex/boardPreviews.ts`,
`packages/backend/convex/visualCaptureReads.test.ts`,
`packages/backend/convex/_generated/api.d.ts` if code generation changes declarations.

**Estimated scope:** Medium, up to five files.

### Task 15: Show complete references on manually arranged cards

- [ ] Complete Task 15.

**Description:** Set useful initial visual proportions and show complete captures
when the user adds them to the board.

**Acceptance criteria:**

- [ ] New visual-capture placements default to image mode and aspect-derived
      initial image height within existing 80–10,000 geometry bounds. Legacy cards
      keep current defaults; no migration or automatic placement.
- [ ] Visual references use containment without stretching/cropping in free cards,
      columns and resized cards; extreme tall/wide images remain entirely visible.
- [ ] Backend tests prove capture/labeling created no board element and independent
      same-URL references are separately placeable; web tests cover all display modes.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/boards.test.ts`;
`pnpm --filter @mindspool/web exec vitest run src/boards/ItemCardNode.test.tsx`;
web/backend typechecks; real drag/resize/column inspection.

**Dependencies:** Task 14.

**Files likely touched:** `packages/backend/convex/boardOperations.ts`,
`packages/backend/convex/boards.test.ts`, `apps/web/src/boards/ItemCardNode.tsx`,
`apps/web/src/boards/ItemCardNode.test.tsx`, `apps/web/src/boards/types.ts`
(only if its derived preview type requires changes).

**Estimated scope:** Medium, up to five files.

### Task 16: Inspect tall captures at useful detail

- [ ] Complete Task 16.

**Description:** Present full source context and add opt-in zoom/scroll viewing
for stored design references using the existing shared image viewer.

**Acceptance criteria:**

- [ ] Inspector identifies browsing/entry/design-site/image URLs distinctly when
      available, without requiring every source to provide all of them.
- [ ] Viewer offers fit and useful zoom with scrolling/panning for tall references;
      retain Escape, focus return and keyboard controls. Other items retain current defaults.
- [ ] A full-page capture is readable beyond a tiny fit-to-screen thumbnail, and
      remains available when requests to the original source image are blocked.

**Verification:** `pnpm --filter @mindspool/web exec vitest run src/inspector/InspectorPreview.test.tsx src/inspector/VisualCaptureViewer.test.tsx`;
web/UI typechecks; inspect a tall stored capture and keyboard navigation in a real browser.

**Dependencies:** Task 15.

**Files likely touched:** `apps/web/src/inspector/InspectorPreview.tsx`,
`apps/web/src/inspector/InspectorPreview.test.tsx`,
`packages/ui/src/components/mindspool/image-viewer.tsx`,
`apps/web/src/inspector/VisualCaptureViewer.test.tsx`.

**Estimated scope:** Medium, four files.

### Checkpoint F: The inspiration-board workflow works

- [ ] Tasks 14–16 pass; captures appear in eligible trays, manual placement is
      required, and complete visuals can be arranged, resized and inspected.

## Phase 7: Prove lifecycle safety and browser parity

### Task 17: Exercise storage lifecycle and existing-flow regressions

- [ ] Complete Task 17.

**Description:** Run adversarial integration cases across upload, item deletion,
enrichment, AI failure and cleanup; fix scoped defects before browser acceptance.

**Acceptance criteria:**

- [ ] Crash injection at every store/register/finalize boundary leaves one durable
      item or eventual cleanup; late writes and scan wraparound cannot delete attached
      files. Pending/foreign asset attachment and forged payloads are refused.
- [ ] Item deletion releases its exclusively owned file; a stale replay does not
      recreate it. Test cancellation, expiry and successful finalize racing cleanup.
- [ ] Existing bare-link dedupe, tweet/Reddit clipping, thumbnails, manual label
      corrections and daily AI-limit behavior pass unchanged; AI failure preserves capture.

**Verification:** `pnpm --filter @mindspool/backend test`;
`pnpm --filter @mindspool/extension test`; backend/extension typechecks;
development storage inventory before/after fault injection, without private data in logs.

**Dependencies:** Task 16.

**Files likely touched:** `packages/backend/convex/visualCaptures.test.ts`,
`packages/backend/convex/visualCaptureUpload.test.ts`,
`packages/backend/convex/visualCaptureReads.test.ts`,
`apps/extension/src/visualCapture.test.ts`,
`docs/verification/visual-web-clipper.md`.
Any production-code fix is a separately scoped follow-up task with its own test.

**Estimated scope:** Medium, five files.

### Task 18: Complete the Firefox and Chrome acceptance matrix

- [ ] Complete Task 18.

**Description:** Load the built extension in each actual browser and exercise
the same product scenarios; record evidence rather than inferring support from builds.

**Acceptance criteria:**

- [ ] In both browsers verify sign-in, capture-first popup visuals/keyboard,
      viewport at top/scrolled/zoomed positions, region capture/cancel, right-click
      aggregator/X images, and complete finite full-page capture with sticky header.
- [ ] Verify source URLs/metadata, two captures of one URL, retry with one item,
      popup close/worker interruption, denied permission, unsupported page, unavailable
      source, oversized reference, infinite page failure, and source-page restoration.
- [ ] Capture → existing AI membership → tray → manual board placement works;
      compare/resize complete references, inspect tall detail, block source-image
      requests, delete a reference and verify file cleanup. No automatic placement.

**Verification:** `pnpm --filter @mindspool/extension build:firefox` and
`pnpm --filter @mindspool/extension build`; record each pass/failure with browser
version in `docs/verification/visual-web-clipper.md`. Use named aggregator samples
when accessible, with unavailable/live-site limitations recorded honestly.
Use T3 preview for web surfaces when supported; native extension checks need
extension-enabled browser sessions. Unavailable sessions leave this task open.

**Dependencies:** Task 17 and working classified/authorized development backend. Use existing text/metadata
decisions and suitable label descriptions for membership checks; do not treat
this acceptance matrix as verification of future image-aware classification.

**Files likely touched:** `docs/verification/visual-web-clipper.md`.
Defects become focused follow-up tasks; do not tick failed matrix entries.

**Estimated scope:** Small tracked change; substantial manual verification.

### Task 19: Record final evidence and hand off for review

- [ ] Complete Task 19.

**Description:** Update project documentation and feature status with the exact
verified scope, then run the final repository gate.

**Acceptance criteria:**

- [ ] README documents popup actions, native image menu, 2 MiB cap, both-browser
      loading instructions, Convex HTTP origin, and the AI-image boundary.
- [ ] Verification report maps every spec success criterion to automated/browser
      evidence, actual cleanup scan bounds, versions and remaining limitations.
      Spec status is updated only when its full acceptance criteria are met.
- [ ] Full repository checks pass without suppressions, skipped tests or weakened
      limits. No secrets, captured private content, production deployment, R2 setup,
      or extension publication is included.

**Verification:** `pnpm check`; review diff and spec coverage. Read installed
Turbo docs before any change to Turbo configuration/commands; none is expected.

**Dependencies:** Task 18.

**Files likely touched:** `README.md`, `SPEC-visual-web-clipper.md`,
`docs/verification/visual-web-clipper.md`, `tasks/todo.md`, `tasks/plan.md`.

**Estimated scope:** Medium, five documentation files.

### Checkpoint G: Ready for user outcome review

- [ ] Tasks 17–19 pass, both browser matrices are complete, storage lifecycle is
      proven, and every spec criterion has evidence.
- [ ] Human reviews the implemented outcome. Production deployment and extension
      publication require separate explicit authorization.
