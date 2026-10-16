# Spec: Tweet link extraction (`tweet-links`)

Status: approved by request 2026-10-15 ("complete all of this"); implemented on
branch `feat/tweet-multi-link-extraction`.

## Objective

Tweets are often lists of resources ("7 mockup tools every designer should
bookmark: mocku.com, studio.morflax.com, …"). Today the whole tweet becomes one
Item and the resources inside it are only text. The owner wants each resource
saved as its own Item, previewed with its own `og:image`, and saved **once**.

User stories:

- When I clip a tweet that mentions several links, each link becomes its own
  library Item next to the tweet, with its page title, description and
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
4. **Threshold.** A tweet is expanded when it has **at least 2** distinct links,
   per the request ("whether there are multiple URL links"). The threshold is
   one constant (`MIN_TWEET_LINKS`).
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
Backfill (dev):   cd packages/backend && npx convex run tweetLinks:backfill
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
  - A tweet clip with 2 or more links creates one Item per link, each with a
    pending enrichment.
  - A tweet with 1 link creates none.
  - Clipping a second tweet that shares a link creates only the new links.
  - Pasting an already-saved link returns the existing id.
  - Retry semantics stay the same.
  - Reddit clips are unaffected.
  - Counters stay exact (the itemState invariant).
  - The backfill sets keys and extracts once.
- **Extension unit tests:** a t.co anchor with a hidden prefix and an ellipsis
  becomes a full URL.

## Boundaries

- **Always:** keep the tweet Item unchanged, route inserts through
  `insertCapture` so counters, search state and enrichment stay consistent, and
  keep owner scoping on every lookup.
- **Ask first:** UI changes (for example, showing "links from this post" in the
  inspector), changing the 2-link threshold, and merging clip content into an
  existing plain link.
- **Never:** fetch `t.co` or X pages from the server (FxTwitter, as on mobile, is the only post source), fail a tweet save because
  extraction failed, or delete existing duplicates automatically.

## Success Criteria

- Clipping the Noah tweet saves the tweet plus 7 link Items. The Simoom tweet
  saves the tweet plus 5. The Palak tweet saves the tweet plus 2.
- Each link Item starts enrichment, and after a successful fetch it has a
  `thumbnail` asset from `og:image`.
- Clipping a tweet whose links are already saved adds no new link Items.
  Pasting `https://www.mocku.com/` after `https://mocku.com` returns the same
  Item.
- `pnpm check` passes.

## Open Questions (defaults taken)

1. Threshold of 2 links (literal reading of the request). A tweet with one
   resource link is not expanded. Lower it to 1 if wanted.
2. Resolved: the resources show their source post in the inspector.
3. A plain pasted tweet URL followed by a full clip of the same tweet still
   gives two Items (clips keep capture-key identity).
