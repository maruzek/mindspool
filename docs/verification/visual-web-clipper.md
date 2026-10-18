# Visual web clipper verification

Date: 2026-10-18. Branch: `feature/visual-web-clipper`.

**Core capture and board workflows passed in both browsers; remaining edge-case acceptance is open.**
Task 0 passed. The Task 0 evidence below proves platform capabilities separately
from the implemented feature’s checks recorded here.

## Desktop acceptance defect: false size rejection below 100% zoom

At 80% zoom, a captured 1,000 × 700 screenshot corresponds to a
1,250 × 875 CSS viewport. The processor compared every encoding candidate against
the larger CSS dimensions, skipped all candidates before encoding, and returned
`too_large`. The popup incorrectly described this as a file exceeding 2 MiB.
The built Chrome processor reproduced the rejection for visible-area, selected-area
and full-page captures. A rounded CSS height could trigger the same issue.

The screenshot quality floor now uses CSS dimensions capped by the actual
available crop pixels. Native output is accepted without upsampling; subsequent
reductions still respect that floor. Direct images retain the 1,280-pixel longest
edge floor, and the planned WebP quality/size ladder and all resource limits remain.
The popup now describes size limits generally because the same error also covers
pixel, edge and page limits. This fix requires reloading the rebuilt extension;
it needs no backend deployment.

Validation:

- Seven processor regression tests pass, including the three previously failing
  zoom/rounding cases, proportional downscaling to exactly the upload cap, and
  rejection when fitting would violate the screenshot floor. The full extension
  suite passes **23 files / 171 tests**, and extension typecheck passes.
- Actual built development Chrome processor, headless Chromium **153.0.8010.12**:
  real `tabs.setZoom` at 80%, 100%, 125%, 200%; viewport, region and scroll/stitch
  all encode successfully. Decoded dimensions, green full-page bottom edge and
  source scroll restoration pass.
- Actual processor source bundled with a test runtime listener, headless Firefox
  **144.0.2**: the same pixel/CSS ratios pass for viewport, region and stitched
  output; transparent source alpha is preserved. This checks Firefox's native
  decoder/canvas encoder, rather than loading its extension or driving browser zoom.
- In both real browser encoders, a **12,984,828-byte** dense 2,400 × 1,800 PNG
  resizes proportionally to **2,040 × 1,530 WebP**, below 2 MiB (Chrome
  **1,888,274 bytes**, Firefox **1,888,842 bytes**). Both screenshot and direct-image
  requests pass, with every returned file fully decoded independently.
- Chrome and Firefox development builds pass; both manifests retain only the
  intended development Convex origins. Desktop acceptance in the user's browser
  versions remains open, including rerunning manual check A after reload.

## Desktop acceptance defect: Node MIME normalization

The user’s Firefox 147.0.1 product captures reached the authenticated upload route
but failed with HTTP 422 (`invalid_image`). Development logs localized the failure
to the post-decode marker comparison in `visualImageDecode.verify`; registration,
ownership and full native decode had succeeded.

A retained fixture upload reproduced the mismatch: `_storage.contentType` and
the served HTTP header contained `image/webp; mindspool-attempt=<nonce>`, while
Node’s fetched `Blob.type` contained `image/webp;mindspool-attempt=<nonce>`.
The uploaded and retrieved payload digests matched. Comparing raw MIME strings
incorrectly rejected the equivalent header after Node removed optional whitespace.

The decoder now normalizes whitespace after semicolons before comparing the
expected format and exact server nonce. Digest matching, owned-attempt checks,
static decoding and all limits remain enforced. The regression uses real Node
`Response.blob()` normalization for PNG/JPEG/WebP and rejects mismatched nonces
and digests. All three positive cases failed before the fix and pass afterward.

Fix validation: backend typecheck and formatting passed; the focused ingestion
suite passed **12 tests**, and the full backend suite passed **46 files / 621
tests** with `vitest run --maxWorkers 1 --pool threads`. The first default-pool
serial run passed 620 tests and hit the known five-second public-schema audit
timeout; all 58 audit-file tests passed alone, and the complete single-thread
run passed without changing timeouts or skipping tests.

This is a backend-only fix; existing development extension builds can be reused.
The failed attempts created no library items; their staged files are reclaimed by
the existing cleanup job. Signed-in desktop capture must be rerun after deploying
the fix; the product matrix below remains open until that result is supplied.

## Saved product captures after the MIME fix

The user reported that the captures now save and supplied a library screenshot
showing six screenshot references. They then explicitly confirmed **all four
modes, including the purple image’s native menu, passed in both Firefox and
Chrome**. Follow-up read-only inspection confirmed eight completed receipts and
eight existing stored WebP files: two of every capture kind. Every file served
successfully and fully decoded; stored dimensions matched the decoder and all
eight retained the fixture title. No private page content or file
URLs are included in this report.

| Kind         | Dimensions  | Bytes  |
| ------------ | ----------- | ------ |
| Viewport     | 2560 × 1305 | 31,802 |
| Region       | 242 × 366   | 7,084  |
| Full page    | 2560 × 2100 | 47,738 |
| Viewport     | 2560 × 1307 | 31,224 |
| Region       | 391 × 242   | 3,474  |
| Full page    | 2560 × 2100 | 47,154 |
| Native image | 160 × 100   | 114    |
| Native image | 160 × 100   | 596    |

Both full-page files had 79 red rows at their midpoint (one compressed 80px
header) and a bottom pixel `[1,128,1]`, confirming complete green-bottom output
without repeated headers. These are successful built-product screenshot saves,
not the earlier disposable capability probes. Both native-image items identify
the fixture’s selected `/target.png` and retain its natural 160 × 100 dimensions.
The user’s confirmation supplies both-browser parity for these four basic saves.
The user subsequently confirmed source-tab scroll restoration, live-image saves,
manual placement/resizing of two references, and 100% image inspection in both
browsers. Read-only inspection also found saved native images from `x.com`
(640 × 380) and `www.inspora.design` (1204 × 1022), and a persisted visual board
placement in image mode. Individual live-site-to-browser mapping was not supplied,
so this does not establish every site in every browser. Zoom/DPI, keyboard,
interruption/retry, denied permission, unsupported/oversized inputs and
stored-copy deletion remain in the edge-case matrix below.

The library screenshot exposed misleading wording: “Extraction failed — link
kept” described a saved image as though only its link remained. The cloud backend
cannot fetch the fixture’s loopback webpage for enrichment, while its uploaded
visual is stored independently. The shared status now says **“Saved — page
details unavailable”**. List/grid regressions preserve the stored-image thumbnail
when enrichment fails, and the ordinary saved-item status uses the same wording.

The status-copy change passed the focused list/grid/component checks (**40 tests**),
the full web suite (**54 files / 329 tests**), web/UI typechecks and the web build.

## Product implementation verification

Branch `feature/visual-web-clipper` contains the capture session/upload lifecycle,
all four acquisition modes, capture-first popup, encoded retry recovery,
provenance, board display and zoomable inspection. No production deployment or
extension publication has occurred. The development backend is
`dev:graceful-stork-346`; both review manifests use that deployment’s `.cloud`
and `.site` origins.

Automated suites cover owned sessions, digest/nonce leases, streamed limits,
static raster decoding, cleanup wraparound and late writes, deletion/replay,
metadata preservation, board placement, controller/recovery, region selection,
image downloads/provenance, fractional-scale stitching, popup states and viewer
controls. `convex-test` omits Blob MIME metadata in its system-storage fixture;
tests patch only that system fixture to model the real runtime’s preserved
marker. Production verification remains strict.

The implementation’s `decodeRaster` passed in Convex Node **v24.21.0** with Sharp
**0.35.5**: 16 × 16 PNG (107 bytes), JPEG (269 bytes), and WebP (98 bytes) fully
decoded; disguised SVG and truncated PNG were rejected. A regression test also
rejects APNG animation controls, because libvips can otherwise decode a static
fallback without reporting multiple frames. Temporary internal decoder probes
were removed after testing.

The **implemented** maintenance job also ran in the real development runtime.
A private harness created synthetic session/attempt rows and five files across
two scans. The job deleted exactly two known-nonce orphans (a post-store crash
and a late write), preserved the exact completed-session asset, an unmarked
legacy file and an unknown-marker file, and scanned **8 rows across 2 calls**
with the configured **50-row per-call bound**. Mutation-side UUID creation and
system-storage MIME markers worked. All five harness files and all harness
session/attempt rows were removed in cleanup. The larger 56-row/two-page
capability proof is recorded separately under Task 0 below.

The CLI’s impersonated identity cannot invoke the temporary internal driver
(it reports “Could not find function”; the normal admin invocation reaches the
driver and correctly fails `requireOwner` without a user identity). No signed-in
Clerk HTTP upload success is inferred from that attempt. HTTP auth/ownership and
full upload/finalize are covered by integration tests; real JWT transport remains
in the desktop matrix.

Actual Chrome **153.0.8010.12** test-build extension processing, after the popup
closed, produced:

| Implemented runtime check | Result                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| Full-page WebP            | 1000 × 2100, 14,130 bytes, complete vertical fixture                        |
| Region WebP               | 100 × 40, 580 bytes; sampled red pixel `[255,1,0]`                          |
| Direct image              | 16 × 16 WebP, 576 bytes; alpha 102 retained from 0.4 input                  |
| Page restoration          | Original scroll 250 and header inline style restored                        |
| Real IndexedDB            | Encoded Blob recovered from another extension context; expired entry pruned |

The implemented page-control helper also ran in Chrome **153.0.8010.12** and
Firefox **144.0.2**: initial header visible, later header suppressed, original
scroll/style/important priority restored, and the page watchdog restored state
after simulated worker loss. This does not prove a signed-in Firefox extension save.

A browser harness rendered the actual popup component with mocked tab/status
transport and the built extension CSS: 380px width with no horizontal overflow,
48px primary button, 40px secondary buttons, shared colors and Archivo. Inspection
caught and fixed Chrome’s default extension body font overriding the shared
layered style; the body now inherits Archivo from the shared root. The actual
viewer component with the built web CSS displayed a 2100px reference at 100%,
scrolled to 800px in a 794px viewport, and closed with Escape. No browser page
errors occurred. This harness supplies visual/component evidence, not Clerk or
native-menu acceptance.

## Final desktop product acceptance (Task 18)

For the remaining checks, use the [step-by-step manual checklist](visual-web-clipper-manual-checks.md).
The fixture launcher now includes oversized, growing, cross-origin permission,
and unavailable-download cases; restart the launcher to load the updated routes.
These fixture paths were checked in headless Chrome 153.0.8010.12 and Firefox
144.0.2 using the implemented page controller: oversized/growing capture failed
with `too_large`, restored scroll 200 and left the header visible. Both browsers
loaded the permission case’s cross-origin 160 × 100 image while canvas access
was tainted; the unavailable case uses a broken-image target and returns 404. This prepares reproducible
manual inputs; it does not mark the native desktop failure matrix as passed.

The prior disposable probe extensions are finished; remove them. Use the built
**MindSpool** extension for this matrix. Development builds are prepared at:

- Chrome: `apps/extension/.output/chrome-mv3-dev` (**Load unpacked**).
- Firefox: `apps/extension/.output/firefox-mv3-dev/manifest.json`
  (**Load Temporary Add-on**).

Rebuild using `wxt build --mode development` and
`wxt build -b firefox --mv3 --mode development` from the extension workspace.
These are complete builds with development environment settings. Default
production builds use a different backend; use the `-dev` paths above for review.

Run `pnpm dev:web`, sign in at **http://localhost:5173**, and check the extension
popup shares that account. Start a product-only local fixture with:

```sh
node scripts/probe-visual-clipper.mjs --fixture-only --port=36668
```

Open **http://127.0.0.1:36668/**. Keep the source tab selected during capture.
Run the following in **both Chrome and Firefox**; report failures verbatim and
record each actual browser version. The recorded Task 0 versions were Chrome
155.0.8059.79 and Firefox 147.0.1.

| Product scenario                                     | Expected result                                                                               | Chrome                                          | Firefox                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Sign-in and popup keyboard order                     | Capture visible area primary, region/full-page next; account compact; no font/CSP errors      | Pending                                         | Pending                                         |
| Visible capture at top, then scrolled                | Saved pixels match each current viewport; two independent items with source metadata          | Top save passed; scrolled pending               | Top save passed; scrolled pending               |
| Region at 80%, 125%, and high DPI                    | Exact rectangle, no overlay; Escape creates no item                                           | Save passed; zoom/DPI/Escape pending            | Save passed; zoom/DPI/Escape pending            |
| Native menu on fixture image                         | Only the purple image saved, independently of page screenshot/preview                         | Passed                                          | Passed                                          |
| Native menu on a design aggregator and X attachment  | Correct selected image; unambiguous entry/post context; no hover UI                           | Live-image save passed; per-site parity pending | Live-image save passed; per-site parity pending |
| Finite full page with red fixed header               | Complete bottom edge, one header, source tab restored; compare original scroll                | Passed                                          | Passed                                          |
| Popup close/reopen and worker restart                | Background finishes or reports interruption; cached retry never recaptures a changed page     | Pending                                         | Pending                                         |
| Offline during save, reconnect, Retry save           | Same intent saves once; repeat intentional capture creates a new item                         | Pending                                         | Pending                                         |
| Denied image-origin permission / unavailable source  | Clear failure or explicit origin grant; selected-area alternative; no preview substitution    | Pending                                         | Pending                                         |
| Unsupported browser page, oversized/infinite page    | Clear failure, no partial success, source styles/scroll restored                              | Pending                                         | Pending                                         |
| Library → label tray → manual board placement        | Current membership decisions respected; no automatic canvas card                              | Passed (user confirmation)                      | Passed (user confirmation)                      |
| Resize/column/full reference and tall inspection     | Complete image, useful 100% scrolling, Escape/focus preserved                                 | Resize/100% passed; columns/keyboard pending    | Resize/100% passed; columns/keyboard pending    |
| Block original image requests, then delete reference | Stored copy still renders; deletion releases stored asset; stale retry does not recreate item | Pending                                         | Pending                                         |

Use an existing suitable label description for current text/metadata membership;
image-aware classification is outside this feature. Named live-site samples and
access failures must be recorded instead of claiming a test passed. The T3
collaborative browser reports no automation host for both status and open;
headless local checks cannot supply this signed-in desktop/native-menu matrix.

## Spec success-criterion coverage

| Criterion                          | Automated / runtime evidence                                                      | Remaining acceptance                            |
| ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1: visible pixels and context      | Controller, page context, owned upload/finalize tests; built processor            | Scrolled/zoomed viewport acceptance             |
| 2: region and Escape               | Region/controller tests; real crop pixels                                         | Real pointer capture at zoom/DPI in both        |
| 3: full-page/restoration           | Planning/stitch tests; Chrome processor; Chrome/Firefox control/watchdog fixtures | Unsupported/infinite-page cases                 |
| 4: actual native image             | Download/target/provenance tests; Task 0 native invocation                        | Per-site/browser coverage and denied permission |
| 5: independent stored pixels       | Read/enrichment preservation tests                                                | Block original image requests                   |
| 6: independent intents/idempotency | Session/controller/recovery/board tests; real IndexedDB                           | Offline/restart retry with one durable item     |
| 7: membership/manual placement     | Board tests assert no automatic placement                                         | Basic tray/placement passed in both browsers    |
| 8: complete movable references     | Card geometry/containment tests; real tall viewer scrolling                       | Columns/extreme-aspect and keyboard edge cases  |
| 9: errors/owner isolation          | Auth/foreign/MIME/size/cancel/timeout tests                                       | Signed-out/permission and live failure states   |
| 10: 2 MiB bound                    | Exact boundary and one-byte-over upload tests; bounded processor                  | Real stored-asset inventory after save/delete   |
| 11: capture-first shared popup     | Popup behavior tests and actual component/CSS visual inspection                   | Both desktop auth/state/keyboard checks         |
| 12: parity and repository gate     | Automated suites, typechecks and builds below; Task 0 both-browser proof          | Final product matrix remains open               |

## Reproduce the completed Task 0 capability checks

From the repository root:

```sh
node scripts/probe-visual-clipper.mjs
```

Keep the terminal open. It prints a local **Fixture** URL, a **Chrome** folder,
and a **Firefox** manifest path. Each run creates fresh temporary extension folders.
No build, MindSpool login, backend configuration, or dependency installation is
needed for this launcher. It uses Node built-ins only. The server listens on
127.0.0.1; if your browser runs on another machine, run this command on that machine
with a checkout of this branch.

1. **Chrome:** open `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked**, and select the printed Chrome folder. Pin the probe's toolbar
   icon if needed. Record the version from `chrome://version`.
2. **Firefox:** open `about:debugging#/runtime/this-firefox`, choose
   **Load Temporary Add-on**, and select the printed Firefox `manifest.json`.
   Use the toolbar Extensions menu to find the probe. Record the version from
   `about:support`. Use a current stable browser for acceptance.
3. In each browser, open the printed **Fixture** URL and leave it selected at the
   top of the page. Click the probe's toolbar icon, then **Run viewport**. The
   popup closes itself. Wait three seconds, reopen it, and check that `capture`
   has no `error`, `mode` is `viewport`, `tiles` is `1`, and `popupClosed` is `true`.
   **Inspect captured image** should show the visible page, including its red
   header and purple image.
4. Return to the fixture, at the top. Open the popup and click **Run scroll/stitch**.
   Wait three seconds without switching tabs, then reopen the popup. Check for
   `mode: "full-page"`, `popupClosed: true`, and no `error`. At default zoom,
   the output height should be `2100`; on high-DPI displays it scales with the
   screenshot-to-CSS ratio. Open **Inspect captured image**: the red header
   appears once, the gradient is continuous, and **Bottom edge** is present.
   Return to the fixture: it must be back at the top with its red header visible.
5. On the fixture, right-click the **purple image** and choose **Save image to
   MindSpool (probe)**. Reopen the popup. Its `imageMenu.srcUrl` must equal the
   fixture origin followed by `/target.png`. This proves native image-target
   invocation; the disposable menu does not perform a production image save.
6. Report the exact versions, viewport result, full-page result, restored page
   state, and image-menu result for each browser. Copy the popup's result text
   if anything fails. Remove both temporary probe extensions when finished, and
   press Ctrl+C in the terminal to stop the fixture.

The probe stores its encoded fixture output in its own local extension storage
so you can inspect it after reopening. Removing the probe removes that data.
This is disposable test behavior, not the product's IndexedDB retry design.
It has no tokens, uploads, social-site permissions, or all-sites permission.
The Firefox hidden-frame adapter passed both desktop viewport and scroll/stitch
checks below, including processing after the popup closed.

## User-run desktop evidence

The user supplied popup JSON and inspected-image screenshots on 2026-10-18.
Tested desktop versions: **Chrome 155.0.8059.79 (Official Build, 64-bit)** and
**Firefox 147.0.1**. The user confirmed that both browsers restored the original
fixture tab to the top with its red header visible after full-page capture.
The first two supplied captures used different modes; the user subsequently
supplied the opposite mode in each browser. All four capture results passed.

| Browser | Capture result                                                                                                            | Native image-menu result                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Firefox | Viewport, 2560 × 1258, one tile at 0, WebP, 30,846 bytes, `popupClosed: true`, `moz-extension://…` processor              | Correct `http://127.0.0.1:36668/target.png` target |
| Firefox | Full page, 2560 × 2100, two tiles at 0 and 793, WebP, 47,498 bytes, `popupClosed: true`, `moz-extension://…` processor    | Correct `http://127.0.0.1:36668/target.png` target |
| Chrome  | Viewport, 2560 × 1305, one tile at 0, WebP, 32,558 bytes, `popupClosed: true`, `chrome-extension://…` processor           | Correct `http://127.0.0.1:36668/target.png` target |
| Chrome  | Full page, 2560 × 2100, two tiles at 0 and 795, WebP, 48,340 bytes, `popupClosed: true`, `chrome-extension://…` processor | Correct `http://127.0.0.1:36668/target.png` target |

The Firefox screenshot contains the visible portion with its red header and
purple image. The Chrome screenshot contains one red header, the continuous
blue-to-green page, and the bottom-edge text. Its final offset of 795 is the
actual clamped scroll position of the overlapping last tile, which is expected.
The Firefox viewport is not expected to include the page's bottom-edge text.

The second Firefox screenshot likewise shows one red header, a continuous
gradient, and the bottom-edge text. Its last offset of 793 is another expected
clamped final tile. The second Chrome screenshot is the expected viewport crop.

Both capture modes, native image-menu invocation, and source-page restoration
are now evidenced in both desktop browsers. The Task 0 browser gate is satisfied.

## Automated Chrome capability evidence

Browser: **Google Chrome for Testing 153.0.8010.12**, headless. This is a real
browser test build, not evidence of current stable Chrome acceptance.

The generated Chrome probe was loaded into an isolated browser profile. A real
extension action granted activeTab, the popup launched the operation and closed,
and a hidden offscreen extension document decoded/stitched/encoded the pixels.
The automation invoked the same button handler automatically when opening the
popup; it did not exercise native context-menu selection.

| Check                  | Observed result                                               |
| ---------------------- | ------------------------------------------------------------- |
| Viewport               | 1000 × 700; one tile; WebP; 19,598 bytes                      |
| Full page              | 1000 × 2100; three tiles at CSS offsets 0, 700, 1400          |
| Encoded full-page size | 33,044 bytes                                                  |
| Popup lifetime         | `popupClosed: true` for both captures                         |
| Processing origin      | `chrome-extension://…`                                        |
| Restored scroll/style  | `scrollY: 0`; header inline visibility restored to empty      |
| Final edge             | Sampled green pixel `[0,128,0,255]`; full bottom text visible |

[Captured scroll/stitch fixture](visual-web-clipper/chrome-stitch.webp).
The image was visually inspected: one red header and a continuous gradient.

Firefox **144.0.2** launches headlessly, but loading its extension-debugging page
via Playwright timed out. Both the available Playwright version and a version
matching that Firefox generation were tried. No automated Firefox
extension/canvas/menu success is claimed; the user-run desktop result above
supplies separate Firefox viewport, scroll/stitch, and native-menu evidence. The T3 collaborative
browser reports no attached automation host for both status and open.

## Convex native decoder and storage recovery evidence

Target: **dev:graceful-stork-346**, personal development deployment in
`martin-ruzek:mindspool`; production was not used. Installed Convex CLI/runtime
package: **1.46.0**. Probe Node runtime: **v24.21.0**.

Pinned backend dependency: **sharp 0.35.5**. A temporary copy of the backend
outside the repository used `node.externalPackages: ["sharp"]` in its temporary
`convex.json`. The Node action deployed and ran successfully. Production decoder
implementation must retain this external-package configuration; Sharp cannot be
bundled into the default Convex isolate. Sharp needs a Node-API v9 runtime
(Node >=20.9) and native optional packages. Linux x64 prebuilt binaries require
SSE4.2 and compatible glibc/musl. No build-policy change was necessary: the existing
lockfile already contained Sharp and its platform packages.

Sources: [Convex bundling](https://docs.convex.dev/functions/bundling),
[Sharp installation](https://sharp.pixelplumbing.com/install/).

The disposable internal action:

- Created a 32 × 24 PNG with alpha and fully decoded it using Sharp raw output,
  `limitInputPixels: 24_000_000`, `failOn: "warning"`, and an explicit static-raster
  format/page/dimension check.
- Rejected SVG bytes presented as an image and truncated PNG bytes.
- Recorded an attempt before storage, wrote an attached file and unregistered
  files, and injected an exception immediately after one unregistered write.
- Set the server-controlled Blob type to `image/png; mindspool-attempt=<UUID>`.
  `_storage.contentType` preserved the exact parameter. The stored URL still
  served a PNG that Sharp decoded successfully.
- Scanned `_storage` in 50-row pages: **56 rows across two pages**. It recovered
  **55 marker matches**, deleted **54 unregistered files**, preserved the attached
  file, and preserved a separate unmarked file. Measured scan/reconcile time was
  **462 ms**. This is a small-volume capability proof, not a production-size SLA.
- Deleted all probe files and the probe attempt. The original backend functions
  and schema were then redeployed successfully; disposable functions were removed.

The probe does not prove the future HTTP JWT/stream boundary, lease races,
late-write expiry/wraparound safety, real finalized-item ownership, or production
maintenance behavior. Those still require Tasks 2–4/17 and their specified tests.

## Permissions, limits, and popup brief review

The Chrome probe needs activeTab, scripting, storage, contextMenus, and offscreen.
Firefox omits offscreen and uses a hidden frame in its background extension page.
The real feature must preserve its existing auth/social permissions, explicitly
add the configured Convex HTTP origin, and request direct-image origins only as
optional permissions. The probe needs none of those network permissions.

Screenshot spacing was **650 ms**, exceeding the planned 600 ms minimum. The
fixture output fits the planned 2 MiB cap and remains at captured CSS resolution.
The 24-million-pixel/32,000-edge/40-tile/30-second bounds, encoding quality floor,
noninteger scale, and unsupported-page matrix remain engineering defaults to test;
a single small fixture does not validate those maxima.

The existing shared UI exports `@mindspool/ui/globals.css`; its Archivo font,
semantic colors, 2px borders, hard shadows, and zero radius match the popup brief.
The planned 380px hierarchy remains appropriate: compact account control and
page title, primary visible-area capture, secondary region/full-page actions,
accessible status, and Open MindSpool. Reuse the installed web Tailwind/Vite
versions (4.3.3) when wiring the extension. This is a source/design-brief review;
rendered popup acceptance remains pending Tasks 6–7.

## Historical Task 0 repository checks

- Backend typecheck: passed.
- Development deployment restoration with typecheck: passed.
- Backend suite: **42 files / 598 tests passed** with `vitest run --maxWorkers 1`.
  The default concurrent run and a four-worker run each hit the existing
  `mcpDiscovery.test.ts` public-function-schema audit's five-second timeout
  (597/598 passed). All 58 tests in that file also passed alone. Serial execution
  resolved the contention without changing any tests or timeout settings.
- Manual launcher: Node syntax check passed; generated Chrome viewport and
  scroll/stitch flows passed as recorded above. User-run viewport, scroll/stitch,
  and native-menu checks passed in both browsers. Exact desktop versions and source-page
  restoration are recorded above.

## Repository gate before the desktop MIME fix

`VITEST_MAX_WORKERS=1 pnpm check` runs the normal repository gate with serial
Vitest workers to avoid the previously observed schema-audit timeout under
resource contention. No tests/timeouts were changed or disabled.

| Workspace | Tests passed |
| --------- | ------------ |
| Schema    | 49           |
| Backend   | 617          |
| Web       | 327          |
| Extension | 164          |
| Mobile    | 119          |
| **Total** | **1,276**    |

Formatting, all six workspace typechecks, web/Chrome/Android builds and a
separate Firefox MV3 build pass. Both development browser bundles were rebuilt
after the final popup/provenance fixes. Manifest inspection confirms the review
builds use only `graceful-stork-346` for Convex `.cloud`/`.site` origins.

Review covered correctness, ownership, nonce/digest attachment boundaries,
stream/pixel/IPC bounds, page restoration, local data lifetime, metadata
preservation, source-link safety and legacy flows. No release readiness claim
is made while the authenticated desktop product matrix is open.
