# Todo: Tweet link extraction

Plan: [plan.md](tweet-links-plan.md). Spec: [SPEC-tweet-links.md](../../SPEC-tweet-links.md).

- [x] **Task 1: `extractLinks` + `urlKey`** (S)
  - Acceptance:
    - The three example tweets give 7, 2 and 5 links in order.
    - Trailing punctuation and `…` are trimmed.
    - `x.com`/`twitter.com`/`t.co` links are skipped.
    - Duplicates by key are dropped, and at most 20 links are returned.
    - `urlKey` removes `www`, the scheme, the trailing slash, the fragment and tracking params, and sorts params.
  - Verify: `pnpm --filter @mindspool/schema test`
  - Files: `packages/schema/src/links.ts`, `links.test.ts`, `index.ts`

- [x] **Task 2: Extension writes full URLs for tweet links** (S)
  - Acceptance:
    - A `t.co` anchor's text becomes a full URL: the hidden prefix is kept, the trailing `…` is removed, and `https://` is added when missing.
    - Mentions and hashtags are unchanged.
  - Verify: `pnpm --filter @mindspool/extension test`
  - Files: `apps/extension/src/tweet.ts`, `tweet.test.ts`, a new fixture

- [x] **Task 3: `urlKey` on Items + plain-link dedupe** (S)
  - Acceptance:
    - Every new `url` Item stores `urlKey`.
    - A plain `items.create` link whose key matches an existing Item returns that id and inserts nothing.
    - Clips with content still insert.
  - Verify: `pnpm --filter @mindspool/backend test items`
  - Files: `validators.ts`, `schema.ts`, `libraryWriters.ts`, `items.test.ts`

- [x] **Task 4: `tweetLinks.extract` scheduled on tweet capture** (M)
  - Acceptance:
    - A tweet with 2 or more new links creates one Item per link, each with pending enrichment.
    - Links that are already saved are skipped.
    - A tweet with 1 link creates none.
    - The tweet save succeeds even if extraction throws.
    - The counters invariant holds.
  - Verify: `pnpm --filter @mindspool/backend test tweetLinks`
  - Files: `convex/tweetLinks.ts`, `tweetLinks.test.ts`, `libraryWriters.ts`, `_generated/api.d.ts`

- [x] **Task 5: `tweetLinks.backfill`** (S)
  - Acceptance:
    - It sets `urlKey` on old link Items, then extracts from old tweets.
    - A second run creates nothing.
  - Verify: backend test
  - Files: `convex/tweetLinks.ts`, `tweetLinks.test.ts`

- [x] **Task 6: Docs + full gate** (XS)
  - Acceptance:
    - `docs/core-concepts.md` describes link dedupe and tweet expansion.
    - `pnpm check` passes.
  - Files: `docs/core-concepts.md`, `CAPABILITIES.md`

- [ ] Manual: in dev, clip the three example tweets and check the Items and thumbnails, then run the backfill once.
- [ ] Review with Martin
