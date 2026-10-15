# Implementation Plan: Item media (link previews, thumbnails, inspector viewer)

Tasks: [todo.md](todo.md). The previous plan (production deploy, complete) is archived at `tasks/archive/deploy-*.md`.

## Overview

Library rows and grid cards show a hatched link tile for every item, even when the clip has images or the page has a preview image. The inspector repeats that tile as its header and puts the images in a small grid at the bottom. This plan does four things:

1. **Link enrichment.** When any link is saved, the server fetches the page and reads its Open Graph / Twitter-card tags: `og:image`, title, description, site name and canonical URL. Those are stored on the item. Other features can reuse this later, which is why it's being built now.
2. **Thumbnails.** Rows and cards show the clip's first image, or the page's `og:image` if the clip has none. Items without any image show a recognisable tile: the brand mark, a globe, or the note glyph.
3. **Inspector hero.** The first image becomes the inspector header, with a strip of the other images below it.
4. **Image viewer.** Clicking any image opens a full-height carousel at that image. It has previous/next buttons, ←/→ keys, swipe, a "2 / 4" counter and Escape to close.

## What exists today

- `items.imageAssets` holds `{kind:"external", url, purpose}` or `{kind:"stored", storageId, purpose}`, where `purpose` is `image | screenshot | thumbnail`. Only X clips (extension and mobile) and Reddit clips fill it.
- **The enrichment plumbing exists, but nothing fetches pages.** `processingRuns.start` with `kind: "enrichment"` sets `enrichmentStatus: "pending"`. `finishRun` validates an `enrichment` result (`canonicalUrl`, `sourceMetadata`, `extractedText`, `imageAssets`) and writes it to the item. `ProcessingStatus` already shows "Processing…". `enrichmentStatus` stays `not_started` today.
- `finishRun` **overwrites** the item with `ctx.db.patch(itemId, content)`. For a tweet clip, that would replace the clip's own images and author with whatever the page fetch returned.
- Labeling (`startDecisionOrFail`) starts as soon as the item is saved, so a pasted link today is labeled from its bare URL.
- Decisions show the pattern to follow: an `internalAction` scheduled from a mutation, plus an expiry job (`decisions.expire`) so a crashed action can't leave a run pending forever.
- `items.list` and the search previews (`previewItem`, `items.ts:347`) carry **no image field**. `boardPreviews.previewItem` already resolves the first asset to a safe URL.
- `@base-ui/react` Dialog is in `packages/ui`. No carousel or HTML-parser dependency is installed.

## Architecture Decisions

- **Enrichment runs as a Convex action.** `enrichment.run` (an `internalAction`) is started from `insertCapture` for every `url` item, mirroring `startDecisionOrFail`: run row, scheduled action, expiry job. It records a run with `model: "og-fetch"`, `modality: "text"` and `questionVersion: "og-v1"`.
- **The fetch is safe and bounded.**
  - Only `http(s)`. URLs with a username or password, IP-literal hosts in private, loopback or link-local ranges, and `localhost` are rejected.
  - Redirects are followed by hand, at most 5, and each hop is checked again.
  - 8s timeout. The parser reads at most 1 MB of the body, and only `text/html`.
  - It sends a plain, honest `User-Agent` and no cookies.
  - Failures end the run as `failed` with a short reason and never affect the item.
- **The parser is a separate pure module.** `pageMetadata.ts` contains `parseMetadata(html, baseUrl)`. It uses a small tokenizer for `<meta>`, `<title>` and `<link rel=canonical>` inside `<head>`, so there's no DOM dependency. It decodes entities, resolves a relative `og:image` against the final URL, and prefers `og:image` (falling back to `twitter:image`, then `og:image:secure_url`). It has its own fixture tests.
- **The og:image is a `purpose: "thumbnail"` asset.** It's stored as `{kind:"external", url, purpose:"thumbnail"}` in `imageAssets`, which needs no schema change. The future feature can find it by purpose, and clip images (`purpose: "image"`) stay separate from it.
- **Enrichment adds to the clip and never overwrites it.**
  - `finishRun` fills only `sourceMetadata` fields that are missing, and sets `canonicalUrl`/`extractedText` only when they're absent.
  - It appends the thumbnail asset only if no asset with that URL already exists, and drops any older `thumbnail` asset, so enriching twice doesn't pile up duplicates.
  - Clip data always wins. Search text is refreshed by the existing `refreshItemState` call.
- **Labeling waits for enrichment on links.** For `url` items, the decision starts when enrichment finishes, whether it succeeded or failed. The model then sees the page title and description instead of a bare URL. Notes keep starting labeling immediately. This behavior change is confirmed (2026-10-15).
- **Image order is chosen in one place.** `imageUrls(ctx, item, limit)` in `itemImages.ts` returns `purpose:"image"` assets first and `thumbnail` assets only when there are no images. It resolves stored assets and keeps only `http(s)` URLs. List previews (`thumbnailUrl`, `imageCount`), `items.detail` (`images`) and board previews all use it.
- **Images stay hotlinked** with `<img loading="lazy" referrerPolicy="no-referrer">`. We never download or proxy the files. A load error falls back to the brand tile. This replaces SPEC-library-view §7 and SPEC-item-inspector's "no image is fetched" note.
- **The image viewer is built in-house** on base-ui Dialog, with no new dependency.

## Dependency graph

```
T1 parser ─► T2 enrichment action + start/expire ─► T3 merge-safe finishRun ─► T4 labeling after enrichment
                                                         │                     T5 backfill existing links
T6 imageUrls + preview fields (purpose order) ──────────┤
   ├─► T7 MediaThumb in rows/cards ─► T8 brand / error fallback
   └─► T9 detail `images` ─► T10 inspector hero+strip ─► T12 open viewer at index
                                   T11 ImageViewer ───────┘
```

T1–T5 (enrichment) and T6–T12 (UI) only meet in the data, so the two tracks can run in parallel. T6 can be built and tested with seeded `thumbnail` assets before enrichment is in place.

## Task List

### Phase 1: Link enrichment (highest risk, first)

- [ ] Task 1: `parseMetadata` pure parser + fixtures (S)
- [ ] Task 2: `enrichment.run` action with a safe fetch, started on capture, with expiry (M)
- [ ] Task 3: `finishRun` merges enrichment into the item instead of overwriting it (S)

### Checkpoint A

- [ ] backend tests and typecheck green. In dev, pasting a news article / GitHub URL produces a `thumbnail` asset and a title. A tweet clip keeps its images and author.

- [ ] Task 4: Start labeling after enrichment for links (S)
- [ ] Task 5: Backfill: enrich existing `not_started` links (S)

### Phase 2: Library thumbnails

- [ ] Task 6: `imageUrls` helper; `thumbnailUrl`/`imageCount` on previews (S–M)
- [ ] Task 7: Rows and cards render the image (S)
- [ ] Task 8: Brand-mark fallback and load-error fallback (S)

### Checkpoint B

- [ ] All tests, typecheck and build green. The dev library shows tweet images, article og:images, and brand tiles for the rest.

### Phase 3: Inspector media

- [ ] Task 9: `images` on `items.detail` (XS–S)
- [ ] Task 10: Inspector hero + strip (S)
- [ ] Task 11: `ImageViewer` lightbox (M)
- [ ] Task 12: Open the viewer from the inspector at the clicked index (S)

### Checkpoint C

- [ ] All tests green. Manual pass covering keyboard-only use, light/dark, and narrow/wide layouts.

## Risks and Mitigations

| Risk                                                                             | Impact | Mitigation                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sites block cloud IPs or bots (X, Instagram, TikTok, Cloudflare-protected pages) | Med    | A failed run is harmless: the item keeps its clip data and the brand tile shows. Fixture tests cover the parser, and a manual check covers a list of real URLs.                                                                                |
| SSRF through user-supplied URLs                                                  | Med    | Scheme, credential and IP-literal checks on every redirect hop. The fetch runs in Convex cloud, so there's no access to the owner's LAN. DNS rebinding to private ranges remains a residual risk, accepted because the backend is single-user. |
| An enrichment result overwrites clip data                                        | High   | T3 changes the merge rule, with a test that a tweet keeps its images and author after enrichment.                                                                                                                                              |
| Labeling is delayed by up to 8s plus the fetch                                   | Low    | Expiry and failure both start labeling, so it's never blocked.                                                                                                                                                                                 |
| Hotlinked og:images expire or refuse to load                                     | Low    | `onError` falls back to the brand tile.                                                                                                                                                                                                        |
| Backfill bursts many fetches                                                     | Low    | Small batches scheduled with a delay between them. ~36 items today.                                                                                                                                                                            |
| Focus handling in a custom carousel                                              | Med    | base-ui Dialog focus trap and restore. Tests assert focus returns.                                                                                                                                                                             |

## Decisions (2026-10-15)

- **Labeling waits for enrichment on links:** yes (T4).
- **Enrichment content:** description only, into `sourceMetadata.description`. No `extractedText` and no body extraction for now.
- **Mobile:** out of scope for this plan. Links shared from mobile still get server-side enrichment.

## Open Questions

- **Hero shape:** 16:9 crop in the inspector, with the full image in the viewer. This is the default unless changed.
