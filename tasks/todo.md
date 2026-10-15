# Todo: Item media

Plan: [plan.md](plan.md). Commands: `pnpm --filter @mindspool/backend test`, `pnpm --filter @mindspool/web test`, `pnpm typecheck`, `pnpm build`.

## Phase 1: Link enrichment

- [x] **Task 1: `parseMetadata` parser** (S)
  - `convex/pageMetadata.ts`: `parseMetadata(html, baseUrl)` (description only, no body text) returns `{title?, description?, siteName?, author?, canonicalUrl?, image?}`.
    - Sources: `og:*`, then `twitter:*`, then `<title>`, `<meta name=description>` and `<link rel=canonical>`.
    - Entities are decoded and whitespace trimmed. Values are truncated to the `finishRun` bounds.
    - A relative `image`/`canonical` is resolved against `baseUrl`, and only `http(s)` results are kept.
  - Acceptance:
    - [x] Fixtures for a typical article, GitHub repo, YouTube and a page with only `<title>` give the expected fields.
    - [x] `og:image="/a.png"` resolves to an absolute URL. `javascript:`/`data:` images are dropped.
    - [x] Malformed HTML and attributes in any order or quote style don't throw.
  - Verify: `pnpm --filter @mindspool/backend test pageMetadata`.
  - Files: `convex/pageMetadata.ts`, `convex/pageMetadata.test.ts`, fixtures.
  - Deps: none.

- [x] **Task 2: `enrichment.run` action, started on capture** (M)
  - `convex/enrichment.ts`:
    - `startEnrichment(ctx, item)` inserts a pending enrichment run (`model:"og-fetch"`, `questionVersion:"og-v1"`, `modality:"text"`), schedules `run` and schedules `expire` after 60s.
    - The `run` action does the safe fetch: http(s) only, no credentials, private/loopback/link-local IP literals and `localhost` rejected, manual redirects (at most 5, each checked), an 8s `AbortSignal` timeout, `text/html` only, at most 1 MB read. It then parses and calls `processingRuns.finish` with `enrichment: {canonicalUrl, sourceMetadata, imageAssets:[{kind:"external", url, purpose:"thumbnail"}]}`, or `failed` with a short reason.
    - `expire` fails a run that is still pending.
  - `insertCapture` calls `startEnrichment` for `url` items, best effort like labeling, so saving never fails.
  - Acceptance:
    - [x] Saving a URL item creates a pending enrichment run, and `enrichmentStatus` becomes `pending`.
    - [x] With the fetch mocked: success leaves `succeeded` with a thumbnail asset; an HTTP error, timeout, non-HTML response or blocked host leaves `failed`, and the item is otherwise unchanged.
    - [x] A redirect to `http://127.0.0.1/` is refused. Notes never start enrichment.
  - Verify: backend tests (`enrichment.test.ts`, with `fetch` stubbed) and typecheck.
  - Files: `convex/enrichment.ts`, `convex/enrichment.test.ts`, `convex/libraryWriters.ts`.
  - Deps: T1.

- [x] **Task 3: Merge-safe `finishRun`** (S)
  - Enrichment fills only missing `sourceMetadata` fields, sets `canonicalUrl`/`extractedText` only when absent, replaces earlier `thumbnail` assets, and never duplicates a URL already among the item's assets. `image` assets from the clip are kept, in their order.
  - Acceptance:
    - [x] A tweet clip (title, author, 2 images) keeps all of them after enrichment, and gains at most one thumbnail.
    - [x] A bare link gets the title, description, site name and thumbnail.
    - [x] Enriching twice leaves exactly one thumbnail. Search text includes the new title.
  - Verify: `processingRuns.test.ts`, `itemState.invariant.test.ts` still green.
  - Files: `convex/processingRuns.ts`, `convex/processingRuns.test.ts`.
  - Deps: none (it can be done before T2).

### Checkpoint A

- [x] backend tests + typecheck green
- [x] Dev (`npx convex dev`): backfill enriched the existing links. Articles and a GitHub URL got a title and thumbnail asset; a tweet clip kept its image and gained a thumbnail.
- [x] Hosts that fail: Reddit returns 403 (its clip data is untouched). X, GitHub and docs sites work.

- [x] **Task 4: Label links after enrichment** (S)
  - For `url` items, `insertCapture` no longer starts the decision. Instead, enrichment finishing or expiring starts `startDecisionOrFail` (when the owner has labels). Notes are unchanged.
  - Acceptance:
    - [x] A URL save has one enrichment run and no decision run. After `finish`, a decision run exists.
    - [x] Expiry or failure still starts labeling. Inbox/needsReview counters stay consistent (invariant test).
  - Verify: backend tests (`items.test.ts`, `decisions.test.ts`, the invariant test).
  - Files: `convex/libraryWriters.ts`, `convex/processingRuns.ts` or `convex/enrichment.ts`, tests.
  - Deps: T2, T3.

- [x] **Task 5: Backfill existing links** (S)
  - `enrichment.backfill` (an internal mutation) reads one page of the owner's `url` items with `enrichmentStatus: "not_started"`, starts enrichment for up to 10, and reschedules itself 5s later while more remain. Labeling is not re-run.
  - Acceptance:
    - [x] Run with `npx convex run enrichment:backfill`, every eligible item ends `succeeded` or `failed`. The run is bounded per call and can be run again safely.
  - Verify: backend test, then a dev run. On prod only after an explicit go-ahead.
  - Files: `convex/enrichment.ts`, test.
  - Deps: T2, T3.

## Phase 2: Library thumbnails

- [x] **Task 6: `imageUrls` + preview fields** (S–M)
  - `convex/itemImages.ts`: `imageUrls(ctx, item, limit)` puts `image` assets first and falls back to `thumbnail` assets when there are none. It resolves stored assets and keeps only `http(s)` URLs. `boardPreviews` uses it.
  - `previewItems` adds `thumbnailUrl` and `imageCount` (gallery size) when there is at least one image. `itemPreview` validator updated.
  - Acceptance:
    - [x] A clip with images gives `thumbnailUrl` set to the first clip image. A link with only an og thumbnail gives that thumbnail. Neither field is set for items without images.
    - [x] Unsafe URLs are never returned. Board preview tests still pass.
  - Verify: `itemQueries.test.ts`, `boardPreviews.test.ts`, typecheck.
  - Files: `convex/itemImages.ts`, `convex/boardPreviews.ts`, `convex/items.ts`, `convex/validators.ts`, tests.
  - Deps: none (it can use seeded thumbnail assets).

- [x] **Task 7: Rows and cards render the image** (S)
  - `library/MediaThumb.tsx` draws `<img alt="" loading="lazy" referrerPolicy="no-referrer" class="size-full object-cover">` inside the tile box, with a "+N" badge when `imageCount > 1`. `ItemList` and `ItemGrid` use it.
  - Acceptance:
    - [x] A row with `thumbnailUrl` renders the img with `referrerpolicy="no-referrer"`, and the row's accessible name is unchanged.
    - [x] Fixed box in list (72×56) and grid (h-32), so nothing shifts as images load.
  - Verify: web tests and a manual check.
  - Files: `library/MediaThumb.tsx`, `library/ItemList.tsx`, `library/ItemGrid.tsx`, tests.
  - Deps: T6.

- [x] **Task 8: Brand fallback + error fallback** (S)
  - With no image, the tile shows `BrandIcon` (X, Reddit, YouTube, TikTok, Instagram, globe, note) instead of the link glyph. `onError` switches to the same fallback.
  - Acceptance:
    - [x] An X item without an image shows `data-brand="x"`, and a generic page shows the globe.
    - [x] An image `error` event replaces the img with the brand tile.
  - Verify: web tests.
  - Files: `library/MediaThumb.tsx`, test.
  - Deps: T7.

### Checkpoint B

- [x] All tests, `pnpm typecheck`, `pnpm build` green
- [ ] Dev library: tweets show their images, articles show their og:image, and the rest show brand tiles
- [ ] Review with Martin

## Phase 3: Inspector media

- [x] **Task 9: `images` on `items.detail`** (XS–S)
  - `images: string[]` from `imageUrls(ctx, item, 10)`, set when non-empty.
  - Acceptance:
    - [x] Same order and fallback as T6. Stored assets resolve, and unsafe URLs are filtered out.
  - Verify: `items.test.ts`, typecheck.
  - Files: `convex/items.ts`, `convex/validators.ts`, test.
  - Deps: T6.

- [x] **Task 10: Inspector hero + strip** (S)
  - The first image replaces the hatched header tile (16:9, `object-cover`). The other images go in a horizontally scrolling strip of square buttons, each named "Open image N of M". The bottom image grid is removed. With no images, the header shows the brand tile.
  - Acceptance:
    - [x] 4 images give a hero plus 3 strip buttons. 1 image gives no strip. 0 images give the brand tile.
    - [x] A broken hero image falls back to the brand tile.
  - Verify: `InspectorPreview.test.tsx`, manual check.
  - Files: `inspector/InspectorPreview.tsx`, test.
  - Deps: T8, T9.

- [x] **Task 11: `ImageViewer` lightbox** (M)
  - Controlled `{images, index, onIndexChange, open, onOpenChange}` on base-ui Dialog: full viewport height, dark backdrop, `object-contain` image.
  - Previous/next buttons, disabled at the ends. ←/→ keys. Swipe when the pointer moves more than 50px. A "2 / 4" counter with `aria-live="polite"`. Close button and Escape. Neighbouring images are preloaded.
  - Acceptance:
    - [x] Keys and buttons navigate, and the counter updates.
    - [x] Escape closes it, and focus returns to the opener.
    - [x] A single image shows no nav buttons and no counter.
  - Verify: `ImageViewer.test.tsx`, manual check on narrow and wide viewports.
  - Files: `packages/ui/src/components/mindspool/image-viewer.tsx`, `apps/web/src/inspector/ImageViewer.test.tsx`.
  - Deps: none.

- [x] **Task 12: Open the viewer from the inspector** (S)
  - The hero and strip buttons open the viewer at their index. Escape closes only the viewer.
  - Acceptance:
    - [x] Clicking the 3rd strip image shows "4 / 4".
    - [x] After Escape, the inspector is still open and the clicked thumbnail has focus.
  - Verify: `ItemInspector.test.tsx`, manual check.
  - Files: `inspector/InspectorPreview.tsx`, `inspector/ItemInspector.test.tsx`.
  - Deps: T10, T11.

### Checkpoint C

- [x] All tests, typecheck, build green
- [ ] Manual: keyboard-only (Tab, Enter, ←/→, Esc), light and dark, narrow inspector
- [ ] Review with Martin
