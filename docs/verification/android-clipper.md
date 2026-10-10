# Android clipper verification

Status: **in progress**. Automated evidence is listed separately from on-device evidence. Nothing in the on-device matrix has been run yet.

## X API field notes (Task 3, recorded 2026-10-10)

Fixtures are in `apps/mobile/src/x/__fixtures__/`. `fx-*` come from `https://api.fxtwitter.com/<user>/status/<id>`, `syn-*` from `https://cdn.syndication.twimg.com/tweet-result?id=<id>&lang=en&token=<token>` where `token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "")`. Responses are real public posts, except the four marked hand-made.

| Case                                 | Fixture suffix                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| text only                            | `text` (nytimes, 2108980679396515996)                                                                                        |
| one photo                            | `photo` (NASA, 2108662426606395572)                                                                                          |
| four photos                          | `multi-photo` (NASADepAdmin, 2107854303809667285)                                                                            |
| video                                | `video` (NASASpox, 2108950762994741523)                                                                                      |
| quote post                           | `quote` (NASAWebb, 2107520267417190819)                                                                                      |
| long post                            | `long` (TheAthletic, 2108914690843718125)                                                                                    |
| long post with photo                 | `long-photo` (NASASpaceOps, 2108634020414095601)                                                                             |
| deleted (bad id, `jack/1`)           | `fx-deleted-200.html`, `syn-deleted-404.html`                                                                                |
| not found                            | `fx-missing-404.json`                                                                                                        |
| protected, 429, malformed, tombstone | `fx-protected-401.json`, `fx-rate-limited-429.json`, `fx-malformed.json`, `syn-tombstone.json` (**hand-made**, not recorded) |

### FxTwitter (primary)

- Success: `{ code: 200, tweet: { id, url, text, is_note_tweet, author: { screen_name, name, protected }, media?, quote? } }`.
- `tweet.text` is the **full** text, including long (note) posts (388 chars in the `long` fixture) and expanded links (`https://nyti.ms/...`). No trailing media `t.co` link.
- `tweet.media` is `null` when there is no media. Otherwise `media.all[]` plus `media.photos[]` / `media.videos[]`; `media.mosaic` appears for multi-photo posts (ignored).
- Photo: `{ type: "photo", url, width, height, altText? }`. `url` ends in `?name=orig` (the extension uses `?name=large`, so the normalizer overwrites `name`). The `multi-photo` fixture has 4 photos, the most seen on X; no cap was observed beyond that.
- Video: `{ type: "video", url (mp4), thumbnail_url, duration, formats[] }`. The poster is `thumbnail_url` (no `?name=` suffix).
- Quote post: outer post has `media: null`; the quoted post lives in `tweet.quote` with its own `text`, `author` and `media`. The outer post must be used alone.
- Author: `author.screen_name` (handle, canonical casing) and `author.name`.
- Surprise: a nonexistent low id (`jack/status/1`) returned **HTTP 200 with an HTML page** ("Sorry, that post doesn't exist"), not JSON. A nonexistent big id returns 404 with `{ code: 404, message: "NOT_FOUND", tweet: null }`. The resolver must treat non-JSON bodies as failure regardless of status.
- Protected posts are expected to give `401 PRIVATE_TWEET` (hand-made fixture, from FxTwitter docs, not recorded: no protected account was available). Unverified.

### Syndication (fallback)

- Success JSON: `{ __typename: "Tweet", id_str, text, display_text_range, entities: { urls[], media[] }, user: { screen_name, name }, photos[], mediaDetails[], video?: { poster }, quoted_tweet?, note_tweet?: { id } }`.
- `text` ends with the `t.co` link of attached media; cut it with `display_text_range` (code point indices, not UTF-16). Link URLs in `text` are `t.co` short links; `entities.urls[].expanded_url` holds the real target.
- **Long posts are truncated** (`note_tweet` has only an id; the `long` fixture text is 277 chars versus 388 in FxTwitter). Syndication cannot give the full text of a long post, so it is a degraded fallback.
- `photos[].url` has no `name` suffix; video poster is `video.poster`.
- Deleted/not found: 404 with an HTML body. Some removed accounts return `{ __typename: "TweetTombstone" }` (hand-made fixture).
- The `token` formula is undocumented and has changed before; failure falls through to link-only.

## Change: background share (2026-10-10)

After the first device run (dev client signed in, Library list works) the share flow changed to a UI-less `ShareActivity` with toasts; see the spec. The Saved screen and `expo-share-intent` are gone, so rows 3 to 4 and 11 to 15 below now mean "toast shown, X stays in front". `expo prebuild` generates the activity, theme and manifest entry; the Kotlin is **not compiled** here (no Android SDK) and is unverified until an EAS build. Cold-start behaviour needs a `preview` build.

## Automated evidence (2026-10-10, no device)

Run from the repository root unless noted.

- `pnpm --filter @mindspool/schema test`: `itemDisplay` tests moved from web and passing; web imports it from `@mindspool/schema`.
- `pnpm --filter @mindspool/mobile test`: `parseShare` (x.com, twitter.com, mobile., www., fx/vx/fixupx, `?s=20`, text around the link, non-X), `resolvePost` against the recorded fixtures (FxTwitter and syndication, fallback order, timeout, 401/404/429/malformed/HTML-200), `buildClip` payload equal to the extension's apart from `captureSource`, and `saveClip` (`CONFLICT` to already saved, timeout to no connection, link-only fallback, unsupported links fetch nothing).
- `pnpm --filter @mindspool/mobile typecheck` and `pnpm --filter @mindspool/mobile build` (Metro bundles the workspace packages, Android Hermes bundle produced).
- `expo prebuild --platform android --no-install` generates a `text/plain` `android.intent.action.SEND` filter and `launchMode="singleTask"` for `com.mindspool.app`.

## On-device matrix

**Not run.** The authoring environment has no Android SDK, `adb`, emulator, or device, so none of Tasks 1, 6 (manual part), 7 (visual) or 9 have device evidence. Every row below is unverified until someone runs it on a phone (record device, Android version, X app version).

| #   | Case                                                                                       | Result     |
| --- | ------------------------------------------------------------------------------------------ | ---------- |
| 1   | Dev build runs; Clerk native sign-in works; session survives kill and reopen (Task 1 gate) | unverified |
| 2   | `api.items.stats` count shows in the Library header after sign-in                          | unverified |
| 3   | MindSpool appears in the X app share sheet; opens on share, cold start                     | unverified |
| 4   | Same, warm start (app already open)                                                        | unverified |
| 5   | Text-only post: one item with `Name (@handle)` title, text                                 | unverified |
| 6   | Multi-photo post: thumbnails match the extension's                                         | unverified |
| 7   | Long post: full text                                                                       | unverified |
| 8   | Quote post: outer post only                                                                | unverified |
| 9   | Video post: text and poster                                                                | unverified |
| 10  | Deleted post: saved as link, "Saved as link"                                               | unverified |
| 11  | Share while signed out, then sign in: saved afterwards                                     | unverified |
| 12  | Airplane mode: retryable error, nothing created                                            | unverified |
| 13  | Re-share of the same tweet: "Already saved", no duplicate                                  | unverified |
| 14  | Re-share of a tweet clipped from Firefox: "Already saved"                                  | unverified |
| 15  | Non-X link: "Only X posts are supported yet", nothing saved                                | unverified |
| 16  | Library list: labels visible, `Labeling…` turns into labels live, tap opens the source     | unverified |
| 17  | Visual comparison with the design's phone list (hatched thumb, tags, Archivo font)         | unverified |
