# Visual web clipper verification

Date: 2026-10-18. Branch: `feature/visual-web-clipper`.

**Task 0 is partially proven. The browser gate remains open; product implementation
has not started.** The disposable probes below exercise platform capabilities,
not the eventual upload/session/cleanup implementation.

## Run the missing desktop browser checks

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
The Firefox hidden-frame adapter is deliberately provided for desktop verification;
its runtime behavior is **unverified** until the checks above pass.

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
matching that Firefox generation were tried. No Firefox extension/canvas/menu
success is claimed. The T3 collaborative browser reports no attached automation
host for both status and open.

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

## Repository checks

- Backend typecheck: passed.
- Development deployment restoration with typecheck: passed.
- Backend suite: **42 files / 598 tests passed** with `vitest run --maxWorkers 1`.
  The default concurrent run and a four-worker run each hit the existing
  `mcpDiscovery.test.ts` public-function-schema audit's five-second timeout
  (597/598 passed). All 58 tests in that file also passed alone. Serial execution
  resolved the contention without changing any tests or timeout settings.
- Manual launcher: Node syntax check passed; generated Chrome viewport and
  scroll/stitch flows passed as recorded above. Firefox and native-menu checks
  remain pending human execution.
