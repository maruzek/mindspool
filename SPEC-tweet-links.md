# Spec: Tweet link extraction (`tweet-links`)

Status: T1–T14 complete, including independent review fixes, the full repository
gate and real extension/browser acceptance. Deployed to approved development
target `dev:graceful-stork-346`. Historical migration execution remains separate;
snapshot-seeded rehearsal is required before production conversion.

## Objective

Tweets often contain useful external resources. The existing feature extracts
two or more links but also saves the tweet as a normal item. Extend extraction
to a single external link and retain the tweet as hidden source context. Each
resource is saved as its own Item with its own `og:image`, and saved **once**.

User stories:

- When I clip a tweet that mentions one or more eligible links, each becomes its own
  library Item, with its page title, description and
  thumbnail (the existing link enrichment does that).
- A link already in my library is not saved again, whether it came from an
  earlier tweet, the same tweet clipped twice, or a link I pasted by hand.
- Tweets I saved before this feature can be processed once with a backfill.

## Behaviour

1. **Which captures are checked.** Every newly inserted Item whose
   `sourceKind` is `x` and which has `extractedText` (extension and mobile
   tweet clips). Repeat clips of the same tweet hit the existing capture key and
   are not processed again.
2. **Link detection** (`extractLinks(text)`, a pure function in
   `packages/schema/src/links.ts`):
   - Finds `http://` / `https://` URLs in the text. Bare domains without a scheme
     are **not** detected (too many false positives such as `Node.js` and
     `e.g.`). Instead, the extension now writes every tweet link as a full URL
     (see 6).
   - Trims trailing punctuation that ends a sentence (`. , ; : ! ? …` and quotes)
     and an unbalanced closing bracket.
   - Skips links to `x.com`, `twitter.com`, `t.co` and their subdomains: these
     are the tweet itself, media pages, mentions or unexpanded short links.
   - Skips URLs that are invalid, over 2,048 characters, or carry credentials.
   - Returns unique links (by URL key, see 3) in order of appearance, at most 20.
3. **URL key.** `urlKey(url)` gives the identity used for dedupe:
   - The host is lowercased, without `www.` and a trailing dot. Default ports are dropped.
   - The scheme is ignored, so `http` and `https` are the same link.
   - The fragment and tracking parameters (`utm_*`, `fbclid`, `gclid`, `mc_cid`,
     `mc_eid`, `ref_src`, `igshid`, `si`) are removed, and the remaining
     parameters are sorted.
   - A trailing `/` is removed from the path, so `mocku.com` and `mocku.com/`
     are the same link.
   - The path keeps its case. Example: `https://www.Mocku.com/?utm_source=x` →
     `mocku.com`.
4. **Threshold.** A tweet is expanded when it has **at least 1** distinct eligible
   external link. The threshold is one constant (`MIN_TWEET_LINKS`).
5. **Saving resources.** For each extracted link without an Item with the same
   `urlKey` from the same owner, an Item is inserted through the normal capture
   path (`insertCapture`):
   - `inputType: "url"`, and `originalInput` is the link as written in the tweet.
   - It uses the tweet's `captureSource` and the capture key
     `xlink:<tweetItemId>:<n>`.
   - Like any pasted link, it gets enrichment (the `og:image` thumbnail, title
     and description), then labeling, counters and search state.

   Extraction runs in its own scheduled internal mutation
   (`tweetLinks.extract`), so a failure there never fails the tweet save.

6. **Extension text.** `parseTweet` writes each `t.co` anchor in the tweet text
   as its full URL:
   - It uses the anchor's whole text, including X's hidden `https://` prefix and
     overflow spans.
   - A trailing `…` is removed.
   - `https://` is added when the scheme is missing.

   So `example.com/starter` is stored as `https://example.com/starter`. Mobile
   text is already expanded by FxTwitter or syndication.

7. **Dedupe for every link save.** Every `url` Item stores `urlKey` (new
   optional field and index `by_owner_url_key`).
   - **A link extracted from a tweet** is skipped when any Item with the same key
     exists.
   - **A plain link save** (`items.create` with `inputType: "url"` and no clip
     content: no `extractedText`, no images, no metadata) returns the existing
     Item's id instead of inserting a duplicate. Retrying with the same capture
     key still returns that id.
   - **Clips that carry content** (tweet clips, Reddit clips) keep their
     capture-key identity and are not merged into an existing plain link.
8. **Backfill.** `npx convex run tweetLinks:backfill` works through all Items
   in batches:
   - **First pass:** it sets `urlKey` on every `url` Item that lacks one.
   - **Second pass:** it runs extraction for every X Item.

   Running it again is safe: extraction never creates a duplicate.

## Truncated clips (added 2026-10-15)

A clip taken from the X timeline holds only the text shown before "Show more",
so links after the cut were missed. Every new tweet clip now runs the
`tweetLinks.run` action first:

- It fetches the post from `api.fxtwitter.com`, the same source the mobile
  clipper uses, with an 8-second timeout.
- If that text is longer, it replaces `extractedText`, and search state is
  refreshed.
- If the fetch fails, the clip's own text is used.

When a tweet's text grows after extraction, only the links new to the text are
saved. A resource you deleted is therefore not re-created. To re-run one tweet:
`npx convex run tweetLinks:run '{"itemId": "…"}'`.

## Source post (added 2026-10-16)

Each link Item created from a tweet stores `fromItemId`, the tweet it was found
in.

- `items.detail` returns `fromPost` (`_id`, `url`, `title`, and a 200-character
  `excerpt`) while that tweet still exists and is the owner's.
- The inspector shows a "Found in post" card that opens the tweet.
- Links that were saved before keep no source.
- The backfill restores `fromItemId` from older `xlink:<tweetId>:<n>` capture
  keys.

## Source-only tweets (revision proposed 2026-10-19)

### Assumptions for review

- This is one extension of the existing extraction workflow, with retained
  tweet provenance; it does not introduce a separate tweet library.
- Tweets with one or more eligible links become source-only. Tweets without
  eligible links remain normal items.
- Preserve the full saved tweet text, URL, metadata, and captured images.
  Reuse the existing “Found in post” card in every newly extracted resource.
- Keep URL identity, ignored hosts, the 20-link cap, fuller-text fetching,
  capture retry semantics, and resource enrichment unchanged.
- Historical conversion is included, confirmed by the user on 2026-10-19.
  Duplicate-source attribution remains under Open Questions. Do not run a
  backfill during specification.

### Required behavior

1. After successful extraction, save the tweet as source context rather than a
   normal library item. This also applies when all eligible URLs already exist
   and extraction creates zero new resources. Conversion depends on detected
   eligible links, not the count of newly created items.
2. Each newly created resource references the saved source tweet. Hiding that
   tweet must preserve the owner-scoped `fromPost` response, inspector excerpt,
   and original-post link. Retain the full saved snapshot, independently of
   whether the external post remains available. Expanding the existing excerpt
   presentation into a full tweet viewer is outside this revision.
3. Exclude source-only tweets from Library, Inbox, Needs review, normal text
   search, source filters, label item lists, board item listings/pickers, and MCP
   library/search results. Exclude them from normal item and label counts.
   Pagination and ordering must remain correct when sources are excluded.
4. Source-only tweets must receive no normal item labels or classification runs
   and incur no classification AI charges. Automatic and explicit labeling
   entry points must respect source-only status. Delayed enrichment or labeling
   completion must not restore labels, visibility, counters, or classification.
5. When captured text already has eligible links, the tweet must not briefly
   appear or be labeled as a normal item while extraction runs. If links are
   discovered only by fetching fuller text, consistently convert the tweet and
   reconcile its previous normal-item state.
6. A fetch failure uses captured text. Extraction failure retains the saved
   snapshot and remains retryable. Resource enrichment failures must not discard
   the saved resource or its source context.
7. Repeated captures, scheduled retries, and concurrent extraction must not
   create duplicate resources, double-count conversion, or lose provenance.
   Preserve the existing protection against recreating deleted resources when
   the source text grows. Deleting one resource must not delete source context
   needed by another. Automatic cleanup after the last resource is outside scope.
8. Storage design belongs in the technical plan. Keeping a row in `items` is
   acceptable with an explicit source-only role respected by all normal-item
   behavior. Preserve owner isolation for source reads and associations.
9. For an existing resource, the proposed attribution rule is to fill a missing
   source while retaining any existing source. This revises the current complete
   skip on deduplication and requires review; multiple sources are not assumed.

### Historical conversion (scope confirmed 2026-10-19)

Provide a bounded, repeat-safe backfill that extracts previously
skipped single links, converts eligible saved tweets to source-only, preserves
snapshots and existing resource references, removes normal label/board
participation, and reconciles search state and counters. It must handle tweets
already marked `linksExtracted` under the old threshold without recreating
resources deliberately deleted after previous extraction. No-link tweets remain
normal. Implementing and testing this backfill does not itself authorize running
it against production.

### Additional verification

Use backend `convex-test` tests to cover zero/one/many eligible links, all links
already saved, source ownership, resource deletion, retries, fuller-text failures,
and concurrent extraction. Exercise scheduled work as well as direct extraction.
Query/invariant tests cover all normal-item surfaces, pagination, counts, recounts,
labels, boards, and MCP reads. Delayed jobs must not reintroduce source-only items.
Inspector tests verify the source card still resolves for every newly created
resource with a hidden source. Historical conversion tests must cover old
single-link tweets marked processed, labeled/board tweets, deleted resources,
and repeated backfills. Preserve existing checks; no new numeric coverage target.

## Tech Stack

The stack is unchanged: Convex 1.46 (mutations, scheduler, `convex-test`),
TypeScript 6, Vitest 5, and the WXT/Firefox extension. There are no new
dependencies.

## Commands

```
Test (backend):   pnpm --filter @mindspool/backend test
Test (schema):    pnpm --filter @mindspool/schema test
Test (extension): pnpm --filter @mindspool/extension test
Typecheck:        pnpm typecheck
Full gate:        pnpm check
Migration:       see docs/verification/tweet-links.md (preview and approval first)
```

## Project Structure

```
packages/schema/src/links.ts          → extractLinks, urlKey (pure, shared)
packages/schema/src/links.test.ts     → fixtures from the three example tweets
packages/backend/convex/tweetLinks.ts → extract (internal), backfill (internal)
packages/backend/convex/tweetLinks.test.ts
packages/backend/convex/libraryWriters.ts → urlKey on insert, plain-link dedupe, schedules extract
packages/backend/convex/validators.ts / schema.ts → urlKey field + index
apps/extension/src/tweet.ts           → full URLs for tweet anchors
```

## Code Style

This feature follows the surrounding code: small exported pure helpers with doc
comments, internal Convex functions with validators, and `best effort` try/catch
around side work on capture.

```ts
/** Identity of a link for dedupe: host without www, path, sorted non-tracking params. */
export function urlKey(raw: string): string | null { … }
```

## Testing Strategy

- **Schema unit tests:** cover `extractLinks` on the exact texts of the three
  example tweets (7, 2 and 5 links), trailing punctuation, `x.com` and `t.co`
  skips, duplicates and the cap. They also cover `urlKey` normalisation.
- **Backend `convex-test` tests:**
  - A tweet clip with 1 or more links creates one normal Item per distinct new
    link, each with pending enrichment and a retained source reference.
  - A tweet with no eligible external links remains a normal tweet Item.
  - Clipping a second tweet that shares a link creates only the new links.
  - Pasting an already-saved link returns the existing id.
  - Retry semantics stay the same.
  - Reddit clips are unaffected.
  - Counters stay exact (the itemState invariant).
  - The backfill sets keys and extracts once.
- **Extension unit tests:** a t.co anchor with a hidden prefix and an ellipsis
  becomes a full URL.

## Boundaries

- **Always:** retain the source tweet snapshot, exclude source-only tweets from
  normal item behavior, route resource inserts through
  `insertCapture` so counters, search state and enrichment stay consistent, and
  keep owner scoping on every lookup.
- **Ask first:** review schema/index/API choices in the technical plan, resolve
  duplicate-source attribution below, and approve new
  dependencies, CI changes, or production migration execution.
- **Never:** fetch `t.co` or X pages from the server (FxTwitter, as on mobile, is the only post source), fail a tweet save because
  extraction failed, or delete existing duplicates automatically.

## Success Criteria

- Clipping the Noah tweet creates 7 normal link Items and a hidden saved source
  tweet. The Simoom tweet creates 5 normal Items, Palak creates 2, and a tweet
  with one eligible link creates 1. Sources do not count as normal Items.
- Each link Item starts enrichment, and after a successful fetch it has a
  `thumbnail` asset from `og:image`.
- Clipping a tweet whose links are already saved adds no new link Items.
  Pasting `https://www.mocku.com/` after `https://mocku.com` returns the same
  Item.
- Existing saved tweets with eligible external links are converted to hidden
  source context, and previously skipped single links are extracted. Repeated
  backfills preserve references and do not duplicate resources or counts.
- `pnpm check` passes.

## Review decisions

The user authorized plan execution, accepting first-source attribution: fill a
missing source and preserve an existing source, including dangling references.
Existing tweets are in scope; live migration execution remains separate.

## Verification and migration

See [the verification report and runbook](docs/verification/tweet-links.md) for
local and live development evidence, exact versioned migration commands,
target classification, backup/recovery and approval requirements.
