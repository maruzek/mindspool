# Spec: Reddit post clipping via the extension

Status: the original checkbox flow was verified in Firefox on 2026-10-08. The immediate-comment revision is implemented and automatically tested on 2026-10-09 under [tasks/plan.md](tasks/plan.md) and [tasks/todo.md](tasks/todo.md); revised authenticated Firefox acceptance remains pending. Real-tweet X regression remains reserved for the user's manual verification. See [the verification report](docs/verification/reddit-clipping.md).

Single capability: save a rendered Reddit post and explicitly clipped comments into the existing MindSpool library. Extends the implemented [extension clipper](SPEC-extension-clipper.md). Each comment button saves immediately into its containing post's item; standalone comment items are outside scope.

## Objective

Let a signed-in MindSpool user click **Clip** on a Reddit post or readable comment in Firefox. A post button saves the post alone. A comment button saves the containing post plus exactly that comment, including only its own text. The Library keeps one Reddit item per owner/post, with the first post snapshot and any comments added through later clips. Existing labeling and capture limits apply.

Success looks like: open a useful discussion, clip a parent or reply directly, then read the post and saved comments together in MindSpool. Parent and reply buttons operate independently.

## Assumptions requiring review

1. Firefox remains the primary browser, using the existing WXT MV3 extension and popup sign-in. Chrome must build, but live Chrome verification is outside this version.
2. Target the current desktop site at `www.reddit.com` and `reddit.com`: home feeds, subreddit feeds, and post detail pages, including detail views opened through in-site navigation. Card and compact views are included. Old Reddit, other Reddit frontends, and native apps are outside this version.
3. **Approved revision: immediate comment clipping.** Keep one Library item containing the post and clipped comments. Each eligible loaded comment has a native Clip button in its own action row; activation immediately saves that comment with the containing post. Whole-thread archival and standalone comment items are outside this version.
4. Capture a snapshot of content available in the rendered post when the user clicks. Do not fetch a fuller version, expand collapsed text, paginate a gallery, or reveal spoilers automatically. Open the post and expand content before clipping when fuller text is wanted.
5. Images are external references, limited to the first ten eligible images available in the post. Video posts save their title, text, and available poster image; video downloads, playback, transcripts, and visual classification are outside this version.
6. **Confirmed by the user: keep one post item and append new comment IDs on later clips.** Preserve previously saved post/comment snapshots. This requires Reddit-specific update behavior: existing `items.create` returns repeated captures unchanged.
7. Persist comment identity and snapshots structurally so duplicate comments can be recognized without parsing formatted text. The existing optional Reddit-specific schema field and backend mutation preserve this storage contract. Reuse existing text/media display where useful. No new dependencies, Reddit API integration, authentication changes, or historical backfill are proposed.

## Existing behavior and constraints

Verified from the repository on 2026-10-08:

- `apps/extension/entrypoints/x.content.ts` injects buttons into X; the background entrypoint already receives a generic `clip` request and calls `items.create` through `ConvexHttpClient` with a Clerk JWT.
- Firefox sign-in and X clipping have been verified in real use; see [the verification report](docs/verification/extension-clipper.md).
- `items.create` accepts `sourceMetadata`, `extractedText`, and external `imageAssets`. It derives `originalUrl` from `originalInput` for URL items.
- Deduplication is per owner and capture key. A repeat returns the existing item unchanged when `originalInput`, `inputType`, and `captureSource` match. A changed original URL with the same key produces `CONFLICT`, even if both URLs reach the same post.
- Metadata limits: title, author, and site name at most 300 characters each; description at most 1,000. Extracted text is at most 100,000 characters. At most ten external images, each with an HTTPS URL of at most 2,048 characters.
- Reddit source detection, the Reddit brand, and the Reddit source filter already exist. The inspector renders metadata, extracted text as plain text, and external image thumbnails.
- Clef's total input budget is currently 500 characters across metadata, URL, and text. Saving a long post does not mean the model reads all of it. Existing AI budgeting and labeling behavior apply.

The current [Reddit subreddit page](https://www.reddit.com/r/firefox/) and a [post detail page](https://www.reddit.com/r/firefox/comments/1wzzk6l/mozilla_met_with_microsoft_to_discuss_their/) were inspected through web retrieval. They expose post metadata, text, images, and crosspost content, but this does **not** verify live DOM selectors, shadow roots, or injection targets. Those require real Firefox inspection during implementation. Selectors are deliberately not specified from memory.

## User experience

- Add one clearly identified **Clip** button to each eligible post's controls. The placement must work in both feed layouts and post detail views without covering Reddit controls.
- The button has a native button role, an accessible name such as “Clip post to MindSpool,” keyboard activation, and visible focus feedback. Clicking it does not open the post, vote, or activate another Reddit action.
- On click, read that post's current content and send exactly one request. Suppress additional clicks while the request is pending.
- On detail pages, add one native **Clip** button to each readable loaded comment's own action row. It has an accessible name “Clip comment to MindSpool,” keyboard activation, visible focus, and polite feedback. Stop click propagation so clipping does not toggle the thread or trigger Reddit actions.
- Activation sends the containing post plus exactly the clicked comment, excluding ancestor and descendant text. A readable containing post is required for the first attempt; post buttons always send zero comments in feed and detail views. There is no selection, selected count, or batch-selection guidance.
- Each comment independently shows `Clip` → `Clipping…` → `Clipped`. Suppress repeated clicks while pending and after success for this visit; other comment and post buttons remain usable. A zero-addition backend result is successful. A new visit starts at Clip because no saved-comment state is fetched; backend deduplication makes repeats safe.
- Freeze the original post/comment payload before sending. Failures remain retryable with that identical payload, even after DOM text changes. Error feedback resets after three seconds without losing retry data; successful comment feedback remains disabled for this visit. Post feedback retains its existing three-second reset.
- Same-post DOM/action-row replacement and temporary detail rendering gaps preserve pending, retry, and successful state. Navigation to another post, leaving detail, or content-script cleanup clears state. Late responses cannot update a later navigation generation, including returning to the same post. Revalidate current route and comment identity on activation.
- Signed out: show “Sign in via the extension popup” and save nothing.
- Missing reliable identity or title: show “Couldn't read this post” and send nothing.
- Rejected payload: show “This post can't be clipped” or “This comment can't be clipped.” Size failures say “This capture is too large to save.” Network failure: “No connection, try again.” Other failures: “Something went wrong.” All errors allow a later retry.
- A title with a valid permalink is sufficient to save. Missing body text, deleted author, missing images, or unsupported media must not prevent a useful title-and-link snapshot.
- Update the signed-in popup status to mention clipping on X and Reddit.
- After saving, the Library shows the post title and Reddit brand; the inspector shows the source URL, subreddit context, author when available, captured text, and image thumbnails when available.
- The inspector distinguishes **Post** from **Selected comments**. Each selected comment shows author when available, plain text, and an “Open comment on Reddit” link. Display replies independently in the saved append order; do not imply that missing ancestors were captured.
- Clip confirmation means the save succeeded. Labeling may still be pending, may suggest no labels, or may hit the daily AI limit; these outcomes do not fail the save.

## Content contract

Read the clicked post alone, or the containing post and exactly the explicitly clipped comment. Do not use the first matching permalink in the whole document, which might belong to another card, a recommendation, an unrelated comment, or a crosspost preview.

| Stored field                            | Required behavior                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputType`                             | `"url"`                                                                                                                                                                                                   |
| `captureSource`                         | `"extension"`                                                                                                                                                                                             |
| `captureKey`                            | `reddit:<lowercase post id>`, excluding a Reddit fullname's `t3_` prefix                                                                                                                                  |
| `originalInput` / derived `originalUrl` | One deterministic HTTPS Reddit post URL, identical across feed/detail views, tracking parameters, and title edits                                                                                         |
| `sourceMetadata.title`                  | The outer post's title, trimmed; required and within the existing 300-character limit                                                                                                                     |
| `sourceMetadata.author`                 | `u/<username>` when readable; omit if unavailable or deleted                                                                                                                                              |
| `sourceMetadata.siteName`               | `"Reddit"`                                                                                                                                                                                                |
| `sourceMetadata.description`            | `r/<subreddit>` when readable; omit if unavailable                                                                                                                                                        |
| `extractedText`                         | A deterministic plain-text representation of available post body/link and selected comment snapshots, with clear section separators, authors, and comment permalinks; at most 100,000 characters in total |
| `imageAssets`                           | Unique, eligible images owned by the post, in document order, at most ten, as `{ kind: "external", url, purpose: "image" }`                                                                               |

Each selected comment must retain its normalized comment ID, owning post ID, stable HTTPS permalink, optional author, plain-text body, and snapshot capture time. Its own body excludes nested replies, votes, controls, and awards. Do not interpret a Reddit comment fullname's `t1_` prefix as part of the normalized ID. A removed/deleted comment without readable text is ineligible; an anonymous/deleted author with readable text is allowed. Comment media downloads and image capture are outside scope; readable links and image alt text may remain in comment text.

The exact field name, validators, mutation interface, and inspector detail shape belong in the reviewed technical plan. These records must remain scoped to the item's owner and be subject to existing item deletion. Do not create a separate comment library or comment management capability.

URL identity rules:

- Validate the post's identity using its own Reddit post permalink and any available post identity attribute. Inconsistent identities are unreadable; comment IDs must never become post IDs.
- Use `https://www.reddit.com/comments/<post id>/` for every post and `https://www.reddit.com/comments/<post id>/_/<comment id>/` for comment source links. Both identity-only routes were verified in Firefox 144.0.2 during Task 1; Reddit redirects them to the intended post and highlighted comment.
- These formats do not depend on readable subreddit metadata or title slugs. Feed, detail, and comment-specific links must produce the same post capture URL and key. See [the compatibility evidence](docs/verification/reddit-clipping.md).
- Strip query parameters, fragments, and comment path segments. Never substitute an outbound article URL for the Reddit post URL.
- Do not relax backend conflict rules to compensate for inconsistent extension URLs.

Text and media rules:

- Preserve useful paragraph breaks, line breaks, list text, and emoji in plain text. Exclude controls, votes, timestamps, flair controls, recommendations, and unselected comments.
- If the feed contains abbreviated text, save that available text as a snapshot. Proposed repeat behavior: keep the first post snapshot and existing comment snapshots, append newly clipped comment IDs, and return the existing item ID. Clipping the same comments again adds nothing. Refreshing edited post/comment text is outside this version.
- New comments append in transaction commit order, preserving prior saved order. Comment clipping never deletes previously saved comments.
- Saves are atomic: a validation or persistence failure saves neither a new post nor a partial comment set. Concurrent saves for the same owner/post must preserve the union of selected comment IDs without duplicates or lost updates.
- Crossposts save the **outer post's** identity, title, author, subreddit, and body. Do not merge the embedded original post's text or media. A title-only outer post is still eligible.
- Only capture media exposed as part of the outer post. Ignore author avatars, community icons, awards, emoji images, unrelated thumbnails, and embedded player UI.
- Keep valid source image query parameters; do not apply X's image URL normalization to Reddit URLs. Reject unusable schemes and skip image URLs outside backend limits. Hidden/unrevealed spoiler media are excluded.
- Do not silently shorten post text, selected comment text, or metadata to fit backend limits. Out-of-limit combined text, including a merge with existing comments, produces invalid feedback and no save; excess post images use the first ten eligible references. Report “This capture is too large to save”; never silently omit or truncate content.
- Render captured content through existing plain-text fields. Do not save or render scraped HTML.

## Saving and labeling behavior

- First save creates a Reddit item and starts the existing labeling flow when eligible. Initial selected comments are included in captured content available to Clef, subject to its existing 500-character budget; do not promise that every comment is classified.
- Under the existing atomic merge behavior, adding comments updates extracted/searchable content and `updatedAt`, preserving creation time, labels, manual decisions, and existing post/media snapshots. Refresh relevant denormalized search/state through the existing backend mechanisms.
- An unchanged repeated clip does not update timestamps or start another labeling run. A comment addition does not automatically start another paid AI run in this version; existing labels remain. Automatic relabeling is an explicit future scope decision.
- Preserve `items.create` semantics for X, web, and mobile callers. Reddit comment merging must not make those capture sources overwrite existing snapshots.

## Tech Stack

Use installed dependencies: WXT 0.21.4, React 19.2.3, TypeScript 6.0.3, Clerk extension SDK 3.1.90, Convex 1.46.0, Vitest 5.0.3, jsdom 29.0.1, and convex-test 0.0.60. Reuse the authenticated background transport; extend its typed contract for Reddit-specific saves as defined in technical planning.

## Commands

Run from the repository root:

```sh
# Firefox development; the existing script includes --mv3.
pnpm --filter @mindspool/extension dev:firefox

# Focused automated checks and bundles.
pnpm --filter @mindspool/extension test
pnpm --filter @mindspool/extension typecheck
pnpm --filter @mindspool/extension build:firefox
pnpm --filter @mindspool/extension build
pnpm --filter @mindspool/backend test
pnpm --filter @mindspool/web test

# Check this spec's formatting now; include changed files during implementation.
pnpm exec prettier --check SPEC-reddit-clipping.md
```

The build commands do not deploy Convex or publish the extension. Load the Firefox bundle manually through `about:debugging#/runtime/this-firefox`, selecting `apps/extension/.output/firefox-mv3/manifest.json`.

## Project Structure

Existing locations:

```text
apps/extension/entrypoints/background.ts    Shared authenticated capture handler
apps/extension/entrypoints/x.content.ts     Existing X flow to preserve
apps/extension/src/{clip,messages}.ts       Existing typed capture contract
apps/extension/src/ClipStatus.tsx           Signed-in popup status
apps/extension/wxt.config.ts               Reddit-specific host permissions
packages/backend/convex/items.ts           Existing persistence and deduplication
packages/backend/convex/validators.ts      Existing capture bounds
packages/backend/convex/schema.ts          Optional Reddit comment snapshot storage
packages/backend/convex/itemState.ts       Search/state refresh rules
apps/web/src/inspector/InspectorPreview.tsx Existing generic captured-content display
```

Proposed locations, subject to technical planning:

```text
apps/extension/entrypoints/reddit.content.ts Reddit content-script entrypoint
apps/extension/src/reddit.ts                Post extraction and URL identity helpers
apps/extension/src/redditClip.ts            Post-to-capture mapping
apps/extension/src/injectRedditButton.ts    Injection and observation
apps/extension/src/redditCommentClips.ts    Independent visit-scoped comment requests
apps/extension/src/*.test.ts                Fixture and interaction tests
apps/extension/src/__fixtures__/reddit/     Minimal anonymized DOM fixtures
SPEC-reddit-clipping.md                     Feature requirements
docs/verification/reddit-clipping.md        Automated and live-use evidence after implementation
```

Keep specifications at the repository root, consistent with the existing project. Do not create `tasks/plan.md` or `tasks/todo.md` for this feature until this spec is approved.

## Code Style

Follow existing strict TypeScript, named exports for helpers, WXT-required default exports for entrypoints, double quotes, semicolons, trailing commas, and repository Prettier formatting. Keep extraction/mapping independently testable; browser messaging and DOM observation remain in the integration layer. Reuse the capture transport without forcing Reddit into the `Tweet` type.

Existing transport style, from `apps/extension/src/clipHandler.ts`:

```ts
const token = await deps.getToken();
if (!token) return { ok: false, reason: "signed_out" };
deps.client.setAuth(token);
return { ok: true, itemId: await deps.client.createItem(args) };
```

Example saved metadata: title `How I organize my reading`, author `u/reader`, site `Reddit`, description `r/productivity`, capture key `reddit:abc123`.

## Testing Strategy

Use behavior coverage rather than a new percentage target. No automated test should depend on Reddit availability or authenticated Reddit credentials.

- **Extraction and mapping (Vitest/jsdom):** fixtures for text posts, paragraph/list/emoji formatting, link posts, single images, available gallery images, video posters, title-only posts, missing author, feed/detail variants, compact view, crossposts, hidden spoilers, selected/unselected comments, nested replies, deleted comments, and unrelated images/comments. Assert exact payloads and identity, not just non-null parser results.
- **Identity and limits:** same post across feed/detail, changed slug, query/fragment, and comment-link variants produces identical key and URL; conflicting/missing identity sends nothing. Cover duplicate image URLs, invalid schemes, ten-image cap, metadata bounds, and 100,000-character text boundary.
- **DOM interaction:** one Clip button per post and eligible detail-page comment. Verify exact parent/reply payloads, independent overlapping pending saves, post-only captures, zero-addition success, frozen retries after edited DOM, signed-out/network/size feedback, same-route rendering gaps, node/action-row replacement, dynamically loaded comments, recycled identity validation, navigation away/back, teardown, and idle observation. Native keyboard behavior requires real-browser evidence.
- **Backend contract (convex-test):** a representative Reddit capture stores post/comments and derives `sourceKind: "reddit"`; repeated key and stable URL returns the same item; new comment IDs merge atomically, old IDs and snapshots stay unchanged, and concurrent saves lose nothing. Assert searchable content/state/timestamps refresh only for actual additions, existing labels remain, and merging starts no new AI run. Cover combined text limits, invalid/wrong-post comment identities, cross-owner isolation, deletion, and legacy items lacking comment fields. Preserve existing X/web/mobile repeat and AI-limit behavior.
- **Web regression:** existing title, brand, source-filter, text, and image behavior must pass. Assert selected comments have distinct authors, readable text, and source links; no selected-comments section appears for legacy or post-only items.
- **X regression:** run the full extension suite and verify the existing X flow still clips in Firefox if shared button or messaging code changes.
- **Live Firefox:** load the revised MV3 bundle, sign in, clip a comment before its post, then a distinct parent/reply and the post; inspect one Library item with exactly saved snapshots and unchanged first post metadata. Exercise overlapping pending actions, newly loaded comments, keyboard activation, row replacement, navigation, signed-out/offline errors and frozen retry, duplicate-safe repeats, and no extra labeling run. Earlier checkbox evidence remains historical; mocked page interactions do not certify authenticated saves.

Record exact checks, browser/version, tested page types, results, and any unverified cases in the verification report. Fixtures alone do not prove compatibility with Reddit's live site.

## Boundaries

- **Always:** require an explicit click; scope extraction to the clicked post; preserve stable identity and per-owner deduplication; enforce existing input limits; keep Clerk tokens in the background script; send captures only through the existing owner's backend; run relevant checks; distinguish automated evidence from live verification.
- **Ask first:** whole-thread or standalone comment capture, Old Reddit, automatic retrieval, media downloads, refreshing saved snapshots, or automatic relabeling on comment additions; dependencies, schema/index changes beyond reviewed comment storage, auth/CI changes, broader host access, deployment, signing, or publishing. Approval of this spec covers the stated Reddit permissions and optional comment snapshot storage in principle; the concrete schema and save interface still require plan review.
- **Never:** auto-clip or bulk scrape; call Reddit APIs or undocumented endpoints; obtain hidden content or inspect private page state; transmit Reddit cookies; expose tokens to page scripts; log post content or secrets; commit credentials or identifiable private fixtures; remove failing tests to make checks pass.

## Success Criteria

1. In Firefox on supported Reddit feed/detail layouts, each eligible outer post has one accessible Clip button that survives new content and in-site navigation.
2. Clicking sends one payload for that post with the specified metadata, available text/link/images, and exactly the clicked comment, or zero comments for a post button. No unselected comments or neighboring/embedded post content are included.
3. The item is stored with `captureSource: "extension"`, `inputType: "url"`, `sourceKind: "reddit"`, and the deterministic `reddit:<id>` capture key and normalized URL.
4. Clipping the same post from different supported views returns one existing item without a URL conflict. Under the existing atomic merge behavior, only new clipped comment IDs are appended; no duplicates, lost updates, changed old snapshots, or automatic AI reruns occur.
5. Library title, Reddit source filter/brand, inspector metadata, post text/images, and a selected-comments section with authors and comment source links work. Saved comment text participates in existing bounded full-library search; label-scoped search retains its current narrower contract.
6. Existing labeling runs when applicable; labeling failure or exhausted AI budget does not prevent saving.
7. Signed-out, unreadable, invalid, and network cases give the specified feedback and allow retry; no save is falsely confirmed.
8. Existing X clipping and authentication behavior continue to work. Extension tests, typecheck, Firefox build, and Chrome build pass; relevant backend/web regression checks pass.
9. A verification report records real Firefox evidence for the supported layouts and representative post types, and explicitly names any remaining gaps.

## Open Questions

1. **Approved revision:** each comment button saves the containing post plus exactly that comment immediately; post buttons save no comments. The backend retains its existing request bound, but no batch selection UI exists.
2. **Confirmed:** one post item, with new comments appended on later clips. Preserve existing snapshots and labels, atomic merging, and comment source links.
3. Approve current Reddit plus Firefox first, with Old Reddit deferred?
4. Approve snapshot behavior and labeling policy: capture only available post/comment content; keep prior snapshots on merges; run AI on the first save only, within its existing budget.
5. Technical planning must verify live post/comment/control boundaries, accessible insertion placement including any shadow-root constraints, and stable post/comment URL strategies. It must specify optional comment storage, validation bounds, and atomic save/update contracts. These are unresolved implementation facts, not claims of compatibility.

The technical plan is saved to `tasks/plan.md`, with the task checklist in `tasks/todo.md`. Plan review resolves the remaining interaction, storage, and compatibility decisions before implementation.
