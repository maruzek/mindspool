# Spec: Visual Web Clipper

Status: **Implemented on feature branch; final Firefox/Chrome acceptance pending.**

The user requested planning on 2026-10-18. See [the implementation plan](tasks/plan.md)
and [task list](tasks/todo.md). The user authorized implementation on a new branch;
`feature/visual-web-clipper` contains the implementation and automated verification.
See [the verification report](docs/verification/visual-web-clipper.md) for the
remaining authenticated browser acceptance.

## Objective

Collect visual design references while browsing, preserving the actual design and
its source so the owner can compare and arrange inspiration on a label's Board
view. The primary scenario is collecting references for a SaaS landing page from
X, design aggregators, and the original websites.

Success means the user can capture the design they are looking at, find that
visual in the library and appropriate label-board tray, and manually place and
resize it alongside other references. A generic social preview alone does not
satisfy a visual capture.

This is one end-to-end capture capability extending the existing extension,
storage, and item display. No capability map is needed. Image-aware AI decisions
are a separate planned capability, not bundled into this spec. Existing board
identity and manual placement remain governed by [SPEC-boards.md](SPEC-boards.md).

## Confirmed product decisions

| Area                   | Requirement                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Primary use            | Collect actual design visuals for a project and arrange them together on a board.                                                       |
| Default capture        | The visible webpage area at the current scroll position. Heroes are common, but the user can capture any section.                       |
| Other screenshot modes | User-selected rectangular area and full page.                                                                                           |
| Direct image capture   | Browser-native image right-click menu action: “Save image to MindSpool”.                                                                |
| Image affordances      | No injected image buttons or hover controls. A temporary region-selection overlay is allowed after explicitly choosing that mode.       |
| Context                | Keep source URLs and available page metadata, including title, description, and `og:image`.                                             |
| Persistence            | Store copies of captured images and screenshots in Convex file storage.                                                                 |
| Board membership       | The AI decision system determines label membership; the extension has no board picker.                                                  |
| Board placement        | Captures appear in the eligible board's tray; the user places them on the canvas. No automatic placement or rearrangement.              |
| Multiple references    | Two different captures from the same URL are separate items that can be arranged independently.                                         |
| Storage provider       | Convex first. The owner reports 1 GB available; this is context, not a verified quota or a retention guarantee. R2 is deferred.         |
| Reference size         | Maximum 2 MiB (2,097,152 bytes) per captured reference, including any derived stored previews.                                          |
| Browser support        | Firefox and Chrome desktop have equal priority, feature scope, and acceptance requirements.                                             |
| Popup redesign         | Substantially redesign and simplify the popup so capture actions come first; account controls and supporting information are secondary. |

## Assumptions and proposed defaults for review

1. The extension popup offers a primary “Capture visible area” action and the
   secondary region/full-page actions. Opening the popup does not itself save anything.
2. Capture saves immediately after the explicit action (or completing region
   selection); no mandatory editor, note, title form, or confirmation dialog.
3. V1 saves still images. Video recording, animated playback, and motion capture
   are deferred. Animated source images produce a clearly identified still.
4. Full-page capture targets finite, ordinary vertically scrolling documents.
   Infinite feeds, nested scrolling canvases, and perfect animation snapshots
   are outside the guarantee. Unsupported captures fail visibly rather than
   silently saving only part of the requested page.

These are draft choices, not additional user-confirmed decisions.

## Existing foundations and gaps

Verified against the repository while drafting:

- `apps/extension` uses WXT with a React/Clerk popup, a background entrypoint,
  and X/Reddit content scripts. Its manifest currently grants source access for
  those sites; general webpage capture and image context menus are new work.
- `pageMetadata.ts` already parses Open Graph, Twitter-card, title, description,
  author, site name, canonical URL, and preview-image metadata.
- `libraryWriters.ts` separates clip identity from bare-link URL deduplication.
  Retries use the capture key; content-bearing clips can share a source URL.
- Item assets support external and Convex-stored images, screenshots, and
  thumbnails. However, `validateClipContent` deliberately rejects stored asset
  references from ordinary client captures. Safe upload/finalization is needed;
  accepting arbitrary storage IDs in `items.create` is not sufficient.
- `itemImages.ts` prefers captured images/screenshots and falls back to page
  thumbnails. It already resolves Convex storage URLs.
- Item deletion already deletes its stored image assets. Failed uploads and
  unfinished captures still need an explicit cleanup lifecycle.
- Label boards and their trays exist. Board cards currently use `object-cover`,
  which can crop a reference; full visual display needs a scoped adjustment.

The historical [extension spec](SPEC-extension-clipper.md) documents the original
tweet-focused implementation. Its statement that enrichment did not exist is
historical; current capture writers already start enrichment and decisions.

## Capture behavior

### Popup redesign

- Match the rest of MindSpool: use the existing design tokens, typography,
  colors, spacing, borders, icons, and interaction states. Reuse appropriate
  components from `@mindspool/ui`; adapt the layout to the popup's compact size
  without introducing a separate visual theme. This applies to capture controls,
  authentication, status feedback, and error states in both browsers.
- Replace the current account/status-oriented popup with a substantially
  simplified capture interface. In the signed-in state, the primary visible-area
  action and the region/full-page alternatives are the first actionable content.
- Make “Capture visible area” visually primary. Keep all three screenshot actions
  directly available without navigating through account controls or settings.
- Keep account controls and a link to MindSpool secondary and compact. Do not
  carry lengthy setup instructions or existing clipping explanations into the
  main capture surface. Keep status feedback concise and close to the actions.
- Signed-out users receive a clear sign-in action with enough context to
  understand that authentication is required; do not expose working-looking
  capture actions that silently fail. Loading, unsupported-page, capture, upload,
  success, and failure states have clear feedback.
- Image capture remains in the native right-click menu, not an image-hover
  affordance or a requirement to choose an image through the popup.
- Use the same hierarchy and behavior in Firefox and Chrome, accessible by
  keyboard with clear labels and focus states. Exact layout and styling are
  reviewable design work in the technical planning phase.

### Visible area (default)

1. The signed-in user opens the extension on the desired tab and clicks
   “Capture visible area”.
2. Capture the webpage viewport at its current scroll position and browser
   zoom, excluding browser chrome, the extension popup, and extension overlays.
3. Preserve what is visible, including site navigation, banners, and overlays.
   Do not silently dismiss dialogs or change the design before capturing it.
4. Save a stored screenshot and the source context described below.
5. Show capturing/uploading/saved states and an actionable failure state.

The intended tab must remain the capture target even if focus changes. If the
tab navigates during capture, cancel or fail rather than combining one page's
pixels with another page's metadata.

### Selected area

- Explicitly choosing “Capture selected area” enters rectangle-selection mode
  in the current viewport. No selection UI appears during ordinary browsing.
- Complete selection to capture only that rectangle, excluding selection UI.
  Match browser/device pixel scaling so the saved crop matches the selection.
- Escape cancels without creating an item or leaving an uploaded asset behind.
- Empty selections do not save. Cross-scroll region selection is deferred.

### Full page

- Explicitly choosing “Capture full page” captures the document's full supported
  vertical extent at its current viewport width, including content below the fold.
- Retain the original page scroll position after the operation, including failure
  or cancellation. Avoid repeating sticky/fixed headers in each stitched segment.
- Bound capture time, pixel count, and encoded size. Do not endlessly scroll
  infinite pages. Final bounds and the browser-specific technique belong in the
  implementation plan and require a representative capture check.
- If a page exceeds those bounds or cannot be captured reliably, explain the
  limitation and offer visible-area or selected-area capture. Do not label a
  truncated screenshot as a successful full-page capture.

### Right-click image

- Add “Save image to MindSpool” to the native browser context menu for images.
  It works independently of the extension popup's screenshot controls.
- Save the selected image itself rather than a screenshot of its surrounding
  feed. Preserve aspect ratio and the whole image; do not save only its displayed
  CSS crop or substitute the page's `og:image`.
- Store the selected, decodable image bytes locally captured/fetched by the
  extension and uploaded to Convex. Do not retain a hotlink as the sole copy.
- If the image is unavailable, unsupported, or permission is denied, report that
  the visual was not saved and offer screenshot capture. Never silently save a
  different image or claim success with only a bookmark.
- Existing tweet and Reddit clipping flows remain available. This does not
  retroactively archive every image from previously saved posts or download all
  attachments on every existing social clip.

## Source context and metadata

Each new visual reference retains:

- A distinct capture identity and capture kind: viewport, region, full-page, or image.
- Capture timestamp and image pixel dimensions, so display and later processing
  can interpret the asset without guessing its proportions.
- The page URL where the capture occurred, preserving meaningful entry paths
  and fragments; canonical metadata must not erase that provenance.
- Available title, description, author, site name, canonical URL, and `og:image`,
  using the current parser's fallback behavior and existing validation bounds.
- For image saves, the selected image's source URL when persistable and useful.
  Temporary blob URLs must not be presented as durable links.
- An aggregator entry or original design-site link when unambiguously available
  in the selected example's context. Do not guess an original site from branding,
  replace the aggregator with an unrelated outbound link, or require users to
  visit the original site before saving.

Capturing an aggregator screenshot retains the aggregator context. Right-clicking
one example saves that example's image even when the page metadata is generic.
When the specific entry/original URL cannot be determined, keep the page URL and
the correct visual; richer source resolution is best effort, not a universal
site-adapter promise. On X, keep a post permalink when it can be associated
unambiguously with the selected image; otherwise preserve the browsing page URL.

The stored captured visual is the primary image. Keep `og:image` as a distinct
metadata thumbnail/reference; enrichment must not overwrite the primary capture.
Metadata failure must not discard a successfully stored visual and source URL.
No new metadata-only capture mode is required by this spec.

## Identity, storage, and failure behavior

- Generate a new capture key for every intentional capture. Reuse it for retries
  of that operation. Retrying a save creates one item; deliberately capturing
  again, even at the same URL or rectangle, creates a separate reference.
- Authenticate upload and finalization. Associate uploaded assets with the
  current owner/capture and verify ownership and actual image content on the
  backend. A user cannot attach or delete another owner's stored file by ID.
- Store a validated, decoded image in a supported static raster format. Use
  bounded resizing/compression to conserve space while preserving design detail,
  proportions, and transparency where applicable. Do not render uploaded SVG/HTML
  as trusted active content. Encoding details are an implementation-plan choice.
- Enforce a **2 MiB (2,097,152 byte) maximum per reference**, including the main
  image and any derived stored previews, on the backend as well as the client.
  Ordinary hero captures should be substantially smaller; no fixed compression
  ratio or number of saves is promised. If the image cannot fit the size/quality
  bounds, fail clearly rather than silently producing an unusable reference.
  Not every full-page capture is guaranteed to fit.
- Mark a visual capture saved only after a durable item references its stored
  visual. Failed/cancelled operations leave no permanent orphan uploads; interrupted
  operations have bounded eventual cleanup. Retrying finalization must not delete
  an asset already attached to the successful item.
- Storage/upload failure leaves existing references intact and offers retry.
  Do not silently evict old captures, fall back to hotlink-only storage, or upload
  to R2. Deleting a reference releases its exclusively owned stored assets.
- AI limits, unavailable providers, or classification failures never invalidate a
  saved capture. Preserve existing inspectable decision/review behavior.

## Library, board tray, and AI boundary

- The library and inspector show the captured image as the main visual with its
  source context. The inspector allows viewing the complete capture at useful
  detail, including a tall screenshot.
- Once existing label membership includes an item, it is available in that
  label's board tray. No extension destination picker or remembered board.
- Capture and AI assignment never create canvas placements, change existing card
  positions, or auto-arrange a board. The user selects references from the tray.
- The tray may use bounded thumbnails, but the whole reference must be inspectable.
  Visual-capture cards on the canvas show the complete image without stretching or
  implicit cropping. Initial proportions follow the asset; resizing preserves
  access to the complete visual. Existing display modes remain available.
- Multiple references from one source remain separately placeable, selectable,
  resizable, and removable under the existing one-placement-per-item rule.
- Reuse the current AI decision pipeline for metadata/text now. Preserve stored
  image access and capture context for the planned image-aware expansion. Do not
  claim that this capture feature makes existing text-only decisions understand
  screenshots or guarantees correct project assignment.
- Image-aware model inputs, preprocessing budgets, provider selection, decision
  accuracy, and reprocessing existing captures require a separate spec.

## Scope exclusions

R2 integration; new independent board identities; automatic canvas placement;
image-aware AI implementation; video/motion recording; full HTML/site archiving;
bulk scraping; mandatory notes or image editing; site-specific aggregator adapters;
retroactive archival of old items; store publication/signing; mobile capture.

## Tech stack

Installed package manifests: WXT 0.21.4, React 19.2.3, TypeScript 6.0.3,
Convex 1.46.0, Clerk Chrome Extension SDK 3.1.90, Vitest 5.0.3,
convex-test 0.0.60, and React Flow 12.12.0 for existing boards.
Use existing dependencies where practical; no dependency addition is approved here.

## Commands

Run from the repository root:

```sh
pnpm --filter @mindspool/extension dev:firefox
pnpm --filter @mindspool/extension build:firefox
pnpm --filter @mindspool/extension build
pnpm --filter @mindspool/extension typecheck
pnpm --filter @mindspool/extension test
pnpm dev:web
pnpm --filter @mindspool/backend test
pnpm --filter @mindspool/backend typecheck
pnpm --filter @mindspool/web test
pnpm --filter @mindspool/web typecheck
pnpm --filter @mindspool/web build
pnpm exec prettier --check SPEC-visual-web-clipper.md
```

Full-repository validation during implementation: `pnpm check`. Before changing
any Turborepo configuration or command, follow AGENTS.md and read the bundled docs
for the installed Turbo package. No Turbo changes are proposed here.

## Project structure

```text
apps/extension/entrypoints/popup/   Redesigned capture-first popup and secondary account/status UI
apps/extension/entrypoints/         Background and explicit page interactions
apps/extension/src/                 Capture contracts/helpers and adjacent tests
packages/backend/convex/            Owned upload/finalization, items, enrichment
packages/schema/src/                Shared validation/types where needed
apps/web/src/boards/                Tray and complete-image card display
apps/web/src/inspector/             Detailed visual/source display
docs/verification/                  Evidence written during implementation
SPEC-visual-web-clipper.md          Product contract; this document
```

Exact new files, schema changes, browser APIs, and upload contracts are chosen
and reviewed in the technical plan, after spec approval.

## Code style

Follow the repository's strict TypeScript, named helper exports, small pure
helpers, and Prettier formatting. Keep browser side effects in extension
entrypoints; keep authorization and durable storage decisions on the backend.
Example from the current image resolver:

```ts
const url =
  asset.kind === "stored"
    ? await ctx.storage.getUrl(asset.storageId)
    : asset.url;
if (url && /^https?:\/\//i.test(url)) urls.push(url);
```

Avoid untyped messages, arbitrary storage-ID acceptance, and duplicated metadata
fallback logic. Preserve existing X/Reddit contracts and ordinary URL deduplication.

## Testing strategy

- Extension Vitest/DOM tests: capture identity and retry behavior; metadata
  fallback; exact selected-image targeting; rectangle pixel scaling; navigation
  races; cancellation; popup action hierarchy and keyboard interaction; signed-out
  and permission/error states. Mock browser APIs
  for unit tests; these tests do not prove real screenshot capture works.
- Backend convex-test: authenticated upload/finalization, foreign/pending asset
  rejection, invalid/oversized images, two captures from the same URL, idempotent
  retries, thumbnail/primary-image ordering after enrichment, deletion and orphan
  cleanup, and AI failures that preserve the saved reference. Cover the 2 MiB
  inclusive boundary, rejection above it, and the total including derived previews.
- Web Vitest/Testing Library: stored primary-image display, aspect ratio and
  complete-image behavior, tray eligibility, source links, independent references,
  and absence of automatic placement. Use real-browser inspection for visual fit.
- Real acceptance in **both Firefox and Chrome** with the loaded extension:
  verify the simplified popup's capture-first hierarchy, then capture a hero, a scrolled
  section, a selected rectangle at non-default zoom, a finite full page with a
  sticky header, an aggregator image, and an image from an X post. Verify saved
  results, source context, sign-in, upload failure/retry, and manual board placement.
- Use the listed aggregators as representative manual samples where accessible:
  styles.refero.design, supahero.io, inspora.design, 60fps.design, recent.design.
  Availability/login changes are recorded; no automated test depends on live pages.
- Confirm a stored reference still loads without fetching its original image URL.
  Confirm unsupported/infinite full-page capture fails within documented bounds.
- Record commands, outcomes, browser/version, and unverified cases in
  `docs/verification/visual-web-clipper.md`. No numeric coverage target is introduced.

## Boundaries

- **Always:** explicit user-triggered capture; keep provenance and primary visual;
  authenticate and validate file ownership/content; bound bytes/pixels/runtime;
  clean up unfinished storage; preserve manual layout and decisions; test changes.
- **Ask first:** new dependencies; storage-provider changes; widening permissions
  beyond the reviewed capture approach; unrelated schema/auth/CI changes;
  deployment or extension publication. Necessary scoped schema/permission changes
  must first be made concrete in the technical plan for review.
- **Never:** inject image hover controls; silently scrape/download every image;
  auto-place references; invent original-site URLs; bypass access controls;
  send page session credentials to the backend; log tokens or captured content;
  silently discard old captures or represent a failed visual save as successful;
  weaken authorization/tests to accept client-provided storage IDs.

## Success criteria

1. Visible-area capture saves the active page's current visible design and source
   metadata as one durable visual reference, excluding extension/browser UI.
2. Selected-area capture matches the user's rectangle; Escape saves nothing.
3. A supported finite full-page capture includes the complete vertical page,
   restores scroll, and avoids repeated sticky headers; unsupported cases fail clearly.
4. The native image context menu saves the chosen actual image with no hover button.
5. Captured pixels remain available from Convex after the original image changes
   or becomes unavailable. `og:image` never replaces an explicit captured visual.
6. Two intentional captures from one URL create separate items. Retrying one
   operation creates no duplicate item or permanent orphan file.
7. Captures enter the existing library and label-board trays according to current
   membership decisions. No capture action creates a canvas placement.
8. The user can place both references on one board and inspect their whole visuals,
   including tall screenshots, while moving/resizing them independently.
9. Signed-out, inaccessible-image, permission, encoding, size, upload, and AI
   failures produce the stated behavior without cross-owner asset access or data loss.
10. Every captured reference and its derived stored previews total at most
    2 MiB; the backend rejects larger uploads/finalizations without permanent orphans.
11. The redesigned popup prioritizes the three capture actions, with visible-area
    capture primary and account controls secondary. Its states and keyboard
    interaction are verified in Firefox and Chrome. Visual review confirms it
    follows the existing MindSpool design system and reuses appropriate shared
    UI components across normal, authentication, loading, and error states.
12. Relevant tests, typechecks, both extension builds, and the full real-browser
    acceptance matrix pass in Firefox and Chrome. A missing browser check remains
    an open acceptance item; one browser is not treated as a fallback target.
    Image-aware AI remains explicitly outside this feature's verified scope.

## Open review points

- The authorized implementation follows the plan’s immediate-save interaction
  and still-image-only scope. Final interaction review remains part of browser
  acceptance. The 2 MiB cap and equal Firefox/Chrome priority remain required.
- Review the popup layout and styling during technical planning; this spec defines
  its hierarchy and behavior rather than a finished visual design.
- The implementation plan must select and demonstrate full-page capture support
  and concrete time/pixel limits before claiming broad support.
- Image-aware AI decisions remain a separate dependency for reliable classification
  based on the visual itself. This spec guarantees capture and availability, not
  visual classification accuracy.

The user subsequently authorized implementation and development verification.
Production deployment, extension publication, and expanding AI-model scope
require separate authorization.
