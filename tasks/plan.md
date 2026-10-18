# Implementation Plan: Visual Web Clipper

Status: **Task 0 in progress; product implementation has not started.**

Branch: `feature/visual-web-clipper`. Automated decoder/storage and Chrome
test-build probes passed on 2026-10-18. Desktop Firefox and native image-menu
checks remain pending; the Task 0 gate still applies. Run
`node scripts/probe-visual-clipper.mjs` and follow the
[verification guide](../docs/verification/visual-web-clipper.md).

Spec: [SPEC-visual-web-clipper.md](../SPEC-visual-web-clipper.md).
Task list: [todo.md](todo.md), the sole execution checklist for this feature.
The user requested planning after spec review and authorized archiving the completed
MCP work in [archive/mcp-discovery-plan.md](archive/mcp-discovery-plan.md) and
[archive/mcp-discovery-todo.md](archive/mcp-discovery-todo.md) on 2026-10-18.

## Goal and constraints

Capture the visible webpage, a selected region, a finite full page, or a
right-clicked image as a durable design reference. Make the actual visual
available for manual arrangement on the existing label boards.

- Firefox and Chrome are equal acceptance targets, using current stable desktop
  releases at implementation time; record exact tested versions.
- Maximum **2 MiB = 2,097,152 bytes** per reference, including derived stored previews.
- Convex storage only; no R2, auto-placement, board picker, hover image buttons,
  video recording, or image-aware AI implementation.
- New capture intent means a new item; retrying the same intent means the same item.
- The popup uses the existing MindSpool design system and prioritizes capture.
- Preserve existing X/Reddit capture and bare-link deduplication contracts.
- Immediate save and static image output are the planning defaults carried from
  the spec. Animation becomes an explicitly described still; capture is never automatic.

## Architecture decisions

### One complete viewport path first

Build only the shared contracts/storage prerequisites needed to save one viewport
through the existing authenticated extension. Prove that complete path before
adding other capture modes. Region and image capture then reuse encoding,
upload, finalization, status, and metadata. Full-page mode is bounded and tested
against the same cross-browser acceptance requirements.

### Capture execution survives the popup

The popup is a launcher and status surface, not the owner of capture work.
The background orchestrator owns intent and browser API calls. A hidden extension
processing document owns DOM canvas decoding, cropping, stitching, and encoding:
Chrome uses an offscreen document; Firefox uses a compatible extension-document
adapter established in Task 0. Never move tokens or raw screenshots into the
website's JavaScript world. Programmatically injected isolated-world page helpers
read bounded metadata, select rectangles, and control full-page scrolling.

Persist only small operation metadata/status in extension storage. Keep any
encoded retry blob in extension-origin IndexedDB, not synchronized storage, and
remove it after success, cancellation, or expiry. Do not persist Clerk tokens.
Do not persist raw full-page tiles across restarts; abort those operations safely.

### Explicit permissions and browser parity

Add `activeTab`, `scripting`, and cross-browser `contextMenus`. Add `offscreen`
only for Chrome when needed by the proven adapter. Retain current social/auth
permissions. Add the configured Convex HTTP action origin explicitly; do not
assume permission for `.convex.cloud` also covers `.convex.site`.

For direct image downloads, declare optional HTTP(S) host access and request
only the necessary image origin after the context-menu user action. Track exact
redirect origins; reject a redirect requiring an ungranted origin rather than
silently broadening access. Prefer a readable already-loaded selected image
when safely available, otherwise an extension fetch without page cookies or
forwarded page credentials. If permissions or canvas restrictions prevent
obtaining the image, offer screenshot capture. No mandatory all-sites access.

Restrict v1 to ordinary HTTP(S) pages. Browser pages, extension pages, local
files, protected stores, unsupported frames, or denied injection produce an
unsupported result, even if a browser API can technically capture some of them.

### Owned upload path; no arbitrary storage-ID attachment

Keep ordinary `items.create` unchanged. Add `visualCaptures` with an immutable
capture context, owner, key, status, upload attempt/lease, expiry, digest,
validated dimensions/format, staged storage reference, and eventual item ID.
Use owner/key and expiry indexes. Add optional `visualCapture` item metadata;
older items need no backfill. Store one canonical visual per item in v1, with no
extra stored thumbnail, so the entire 2 MiB budget belongs to the useful image.

An authenticated HTTP upload route receives binary bytes tied to an owned
capture session. It bounds the stream before buffering and stores through a
server-owned operation; clients never supply a storage ID for finalization.
Use the existing Clerk Convex JWT and `ctx.auth.getUserIdentity()`, not a second
authentication scheme. The backend never downloads an arbitrary image URL.

Actual server-side raster decoding is required, beyond trusting headers or a
client's width/height. Pinned dependency: **`sharp` 0.35.5 in the backend Node action**, proven on the
personal development deployment in Task 0. Configure
`node.externalPackages: ["sharp"]` in `packages/backend/convex.json` when the
production decoder is added; the disposable probe used this in its temporary
configuration. Fully
decode with strict pixel/frame limits; accept static PNG/JPEG/WebP only. The
browser canonicalizes other decodable sources into that set. Invoke Node
decoding using a private staged storage ID, not public file URLs. The server overwrites
the stored Blob MIME parameter with its own attempt marker before storing;
client-provided markers are never trusted. Dependency
installation is part of later plan approval, not performed during planning.

Finalization atomically inserts the owned item with its server-attached asset
and marks the session complete. Use a dedicated internal writer so existing
external-only validation is not weakened. Invoke the existing enrichment/decision
pipeline only after the visual and item exist. Enrichment preserves the visual.

### Crash cleanup is part of the upload design

An HTTP action's storage write and its subsequent mutation are not atomic.
Do not claim that `try/finally` alone closes this gap. Before writing, record an
attempt with a server-generated nonce. Tag its stored blob with a standard image
MIME type plus a server-controlled attempt parameter. Task 0 must prove that
Convex retains that parameter in `_storage.contentType`, that storage URLs still
render correctly, and that a paginated system-table scan can recover a file
written before the storage-ID registration mutation.

A bounded maintenance scan reconciles only files carrying this capture marker
against the recorded attempt. It never deletes unrelated legacy storage or an
attached item asset. Expiry first atomically closes the attempt, preventing late
finalization; late writes remain identifiable on subsequent scans. Scan system-storage rows in pages
of 50 with a persisted cursor and recurring wraparound; do not permanently pass
over an unexpired candidate. Expire unfinished sessions after one hour, run
maintenance every five minutes, and target cleanup within the next complete
scan after expiry. Preserve completed-key receipts so a stale retry cannot
recreate an intentionally deleted reference.

**Task 0 is a hard feasibility gate:** if marker retention, Node decoding,
cleanup safety, or browser processing cannot be proven, revise this architecture
and review it before storage implementation. Do not replace it with trusting
arbitrary uploaded IDs or deleting all unrecognized files. Timing and scan
guarantees are measured and recorded on representative storage volume.

### Source context and explicit identity

Use `visual:<UUID>` per user intent, created once in the trusted extension
orchestrator. Persist that key across network retries. Context consists of page
URL, optional canonical/source-image/entry/design-site URLs, bounded metadata,
capture kind, capture time, dimensions, and whether animation was flattened.
An immutable context fingerprint plus encoded-payload digest detects conflicting
reuse; a different context/body for a live key is a conflict.

Use the existing metadata parser on a bounded reconstruction of document-head
metadata read from the actual rendered page. Keep its fallback order, while
trimming fields to current backend capture limits. Do not send raw body HTML,
cookies, form inputs, or an entire DOM snapshot. Retain the actual browsing URL
separately from canonical metadata. For aggregator/image captures, record only
unambiguous links from the selected image's local context; failure to resolve
them never prevents saving the correct visual.

### Complete visuals on existing boards

Add optional capture kind/dimensions to existing owned detail/board-preview
projections. New visual cards default to image mode, with initial height derived
from stored dimensions and clamped to the existing board geometry limits.
Use `object-contain` for these references, including after resizing and inside
columns; do not change legacy card cropping or rewrite saved layouts.

The existing viewer fits the entire image but does not provide useful zoom for
long pages. Add optional zoom/scroll inspection for visual references without
changing the default viewer behavior for other items. Preserve source context
in the inspector. Board membership remains the existing AI label decision;
there are no placement writes from capture or decisions.

## Shared contracts

Define `packages/schema/src/visualCapture.ts` as the shared vocabulary:

```ts
type VisualCaptureKind = "viewport" | "region" | "full-page" | "image";
type CaptureContext = {
  captureKey: string;
  kind: VisualCaptureKind;
  pageUrl: string;
  capturedAt: number;
  sourceMetadata?: {
    title?: string;
    description?: string;
    author?: string;
    siteName?: string;
  };
  canonicalUrl?: string;
  sourceImageUrl?: string;
  entryUrl?: string;
  designSiteUrl?: string;
  isAnimationStill?: boolean;
};
type EncodedVisual = {
  blob: Blob;
  width: number;
  height: number;
  contentType: "image/png" | "image/jpeg" | "image/webp";
};
```

`Blob` stays in the extension processor/upload transport, never a Convex validator.
Backend validators mirror the serializable context, rejecting unsafe URLs and
unbounded metadata. Server-derived dimensions are authoritative.

| Boundary           | Contract                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popup → background | `start-visual-capture { kind: viewport                                                                                                                                                                          | region | full-page }`returns`{ captureKey }`; background derives the target tab and context. |
| Background status  | `get-visual-capture-status { captureKey? }` returns `idle / selecting / capturing / encoding / uploading / saved / cancelled / failed`; saved includes item ID, failure includes typed reason and retryability. |
| Native image menu  | Uses `contextMenus.onClicked` target data plus a same-document selected-image context token; never accepts arbitrary page-origin upload requests.                                                               |
| Begin RPC          | `visualCaptures.begin({ context }) → { captureId, state, itemId? }`, owner/key idempotent with context-conflict validation.                                                                                     |
| Upload HTTP        | `POST /visual-captures/upload?captureId=…`, Bearer JWT and raw raster body; streams at most 2,097,152 bytes; success returns capture status, never a reusable arbitrary-file attachment capability.             |
| Finalize RPC       | `visualCaptures.finalize({ captureId }) → { itemId }`; only a verified, owned server-registered asset can be attached.                                                                                          |
| Status/cancel RPC  | `visualCaptures.status({ captureId })` and `visualCaptures.cancel({ captureId })`; missing/foreign are indistinguishable. Cancellation never deletes a finalized item.                                          |
| Internal save      | `insertVisualCapture(ctx, ownerId, captureId) → Id<"items">`; atomically claims the staged asset, inserts one item, updates session/receipt, and starts existing processing.                                    |

Extend the extension's typed error vocabulary for `unsupported_page`,
`permission_denied`, `image_unavailable`, `too_large`, `page_changed`,
`capture_interrupted`, `signed_out`, `network`, and generic failure. Backend
failures retain current structured Convex conventions; HTTP maps to 401,
404, 409, 413, 415/422, or retryable 5xx without content/token leakage.

## Capture and encoding limits

Proposed implementation constants, validated at the Task 0 gate:

| Limit                 | Value and behavior                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stored bytes          | Inclusive 2,097,152; reject anything larger server-side.                                                                                                                                                           |
| Source image download | 16 MiB stream cap, 10-second timeout; no unbounded response buffering.                                                                                                                                             |
| Decoded image         | Maximum 24 million pixels and 32,000 pixels per edge before canvas/decode.                                                                                                                                         |
| Full-page capture     | 30 seconds, 40 tiles, 24 million output pixels, 32,000 output height; abort on any limit.                                                                                                                          |
| Screenshot cadence    | At least 600 ms between screenshots, serialized per browser instance; stay below Chrome's documented two calls/second.                                                                                             |
| Stability             | Abort if target tab/document/URL, viewport width, device scale, or page extent changes incompatibly during capture.                                                                                                |
| Encoding              | Try original dimensions, WebP qualities 0.9, 0.82, 0.74; preserve alpha. Then at most two proportional reductions to 0.85 and 0.7 of original dimensions, repeating qualities. Never crop to fit bytes.            |
| Quality floor         | Do not downscale a screenshot below its captured CSS dimensions; do not shrink a direct image's longest edge below 1,280 pixels unless it started smaller. If still too large, explain and offer a smaller region. |

Unsupported codec output must fail or use a proven PNG/JPEG fallback within the
same limits. Encoding/decoding confirms actual output type and dimensions.
These are bounded engineering defaults, not claims of browser capability already
verified. Both browsers must pass the same supported full-page fixtures.

Full-page capture uses a shared scroll-and-stitch implementation rather than a
Chrome debugger permission or Firefox-only full-page API. Snapshot initial scroll,
hide fixed/sticky repeats only for subsequent tiles, stitch actual offsets (last
tile may overlap), and restore styles/scroll on completion, cancellation, navigation,
or timeout. A page-side watchdog restores temporary modifications if the extension
worker disappears. Lazy-load extent changes settle within the same deadline;
unbounded growth is unsupported. Do not dismiss real page dialogs or erase them
from ordinary viewport/region captures.

## Popup design brief

Keep the current compact 380px width as the initial layout constraint, adjusted
only after visual review. Use Archivo, shared semantic tokens, zero-radius
controls, existing borders/shadows, and icons from the shared UI library.

```text
MindSpool                          [compact account control]
Current page title (one line)

[ Capture visible area                                  ]
[ Select an area             ] [ Capture full page      ]

Short live status / retry or sign-in action when needed
Open MindSpool
```

No technical setup paragraphs or destination selectors. Signed-out/loading states
explain availability; unsupported-page feedback is specific. Tab order follows
visual order. Capture remains understandable without icons or animation. Image
right-click capture uses a short action-badge status plus persistent popup status,
so results are visible even though the menu cannot contain a progress UI.

## Dependency graph and execution order

```text
0 feasibility + popup design review
  → 1 shared contracts/schema
  → 2 owned sessions → 3 upload ingress → 4 finalize/cleanup
  → 5 viewport vertical slice
       → 6 shared popup styles → 7 capture-first popup
       → 8 metadata/source context → 9 region capture → 10 image context menu
       → 11 full-page scroll → 12 stitching
       → 13 interruption/retry recovery
  4 + 8 → 14 read projections → 15 board visuals → 16 detailed image viewer
  all slices → 17 lifetime/security regressions → 18 browser matrix → 19 final docs/checks
```

Tasks are fully specified in [todo.md](todo.md). Checkpoints follow Tasks 0–2,
3–5, 6–8, 9–10, 11–13, 14–16, and 17–19. Keep additions behind unavailable
controls until their complete flow is ready; every committed step builds.
Generated Convex API declarations are included in the owning task's file budget.

No delegation is started by this plan. During later authorized execution, popup
styling can proceed independently of backend work after contracts, and display
work after projections can proceed independently of capture-mode helpers. Schema,
shared message contracts, background wiring, and upload state transitions remain
sequential/coordinated changes.

## Verification and review focus

1. A tab switch/navigation must never capture another page or mix its metadata
   with the original pixels (Tasks 5, 9, 11–13).
2. Crash between storing a file and registering its ID must be recoverable without
   deleting a finalized or foreign asset (Tasks 0, 3–4, 17).
3. A tiny encoded image claiming huge dimensions, truncated raster, or disguised
   SVG must fail server validation (Tasks 3, 17).
4. X/aggregator source context and CDN permissions must target the selected image,
   including cross-origin/redirect failure, rather than another card (Tasks 8, 10).
5. Tall/wide references must remain complete and readable in free cards, columns,
   resized cards, and the inspector (Tasks 14–16, 18).

Use focused Vitest commands per task, relevant typechecks after each slice, and
both extension builds at integration checkpoints. Full `pnpm check` is the final
repository gate; follow installed Turbo docs before changing any Turbo commands
or configuration. No Turbo change is planned.

Use T3 collaborative preview for supported web-app inspection. Extension install,
native context menus, offscreen documents, and actual browser screenshots require
real extension-enabled Firefox and Chrome sessions. A preview screenshot alone
does not satisfy those checks. If that environment is unavailable, preserve the
acceptance task as open and record exactly what remains unverified.

## Risks and mitigations

| Risk                                            | Impact         | Mitigation                                                                                                        |
| ----------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Offscreen/background differences                | High           | Task 0 proves both processing adapters and popup-close behavior before the upload/UI build.                       |
| Native raster dependency in Convex Node runtime | High           | Verify pinned Sharp packaging/decoding early; review an alternative if unsupported rather than weaken validation. |
| Orphan storage after process death              | High           | Server-owned attempt marker, leases, recurring bounded reconciliation, and injected crash tests.                  |
| Infinite/lazy pages or sticky layers            | High           | Early fixture proof, fixed bounds, watchdog restoration, no truncated success.                                    |
| 2 MiB compression obscures design details       | Medium         | Limited quality/downscaling ladder, real design review, reject with region alternative.                           |
| CDN/CORS permissions prevent image download     | Medium         | Optional origin access, bounded credential-free download, no silent substitution; screenshot alternative.         |
| Popup design diverges from app                  | Medium         | Import shared CSS/build pipeline and components; review all states beside the app.                                |
| AI currently cannot classify image content      | Known boundary | Save still succeeds; reuse metadata decisions, leave image-aware AI to its own spec.                              |

## Review gates and completion

The user's planning request approves moving beyond the spec, not implementation.
Review this plan's proposed Sharp dependency, optional-origin permissions,
additive capture/session schema, full-page limits, and popup hierarchy together.
Task 0 confirms technical feasibility without weakening the product contract.

No production deployment, publishing/signing, credential changes, or R2 work is
authorized here. Any backend runtime verification first classifies its target
under the repository's deployment guard. No bulk data migration is needed.
After plan approval, execute the checklist in order; do not mark the feature
complete until both browser acceptance matrices and the repository checks pass.

## Sources checked during planning

Installed Convex **1.46.0** types were read from the backend workspace, including
storage Blob access, file metadata, and deprecated metadata APIs. Repository
sources read include `libraryWriters.ts`, `validators.ts`, `enrichment.ts`,
`boardPreviews.ts`, `boardOperations.ts`, extension background/manifest/popup,
and shared image-viewer and theme styles.

- [MDN captureVisibleTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab): active-tab viewport capture and permissions.
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs): viewport API and two-calls-per-second limit.
- [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen): hidden document processing with DOM APIs.
- [Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): termination/restart requires explicit state handling.
- [MDN optional host permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions): optional origin access.
- [Convex HTTP actions](https://docs.convex.dev/functions/http-actions): authenticated request handling, binary bodies, Node action calls, and `.convex.site` origin.
- [Convex storage](https://docs.convex.dev/file-storage/store-files) and [metadata](https://docs.convex.dev/file-storage/file-metadata): server-managed Blobs and system metadata; marker behavior still requires Task 0 proof.
- [Sharp input documentation](https://sharp.pixelplumbing.com/api-input/): decoder metadata; complete decode, limits, and Convex compatibility remain implementation verification requirements.
