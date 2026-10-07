# extension-clipper verification

Date: 2026-10-07. Branch: `main` (uncommitted at the time of writing).
Spec: [SPEC-extension-clipper.md](../../SPEC-extension-clipper.md). Plan: `tasks/plan.md`.

**Status: implemented and working end to end on real tweets in Firefox. One bug found in the walk-through (a quoted
tweet's video thumbnail was clipped as the tweet's image) is fixed, tested and re-checked on real X. The AI-limit
case and the unreadable-tweet case were not checked in real use.**

## Automated

| Check                 | Result                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm test` (backend) | 18 files, 225 tests pass                                                                 |
| `pnpm test` (web)     | 274 tests pass                                                                           |
| `pnpm test` (ext.)    | 45 tests pass (parser, builder, clip handler, token provider, button, popup status)      |
| `pnpm typecheck`      | passes                                                                                   |
| `pnpm build`          | passes                                                                                   |
| `build:firefox`       | passes; Firefox MV3 manifest has the gecko id, x.com/twitter.com and Clerk/Convex hosts  |
| `pnpm format:check`   | Fails only on `.mcp.json` (pre-existing); the spec and task files were not yet formatted |

## Success criteria

| #   | Criterion                                                | Evidence                                                                                                                                                                                                               |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One item per clip with the described fields              | Verified on the dev deployment: several `x:<id>` rows with `captureSource: "extension"`, `inputType: "url"`, source kind `x`, metadata and text. A tweet with an image showed its thumbnail in the inspector (manual). |
| 2   | Clipping again creates no second item                    | Verified manually (clipped twice, one item) and in `items.test.ts` "returns the stored item unchanged for a repeated key".                                                                                             |
| 3   | Labeled by `clef-flash`, appears in library              | Verified: several tweets labeled by Clef (for example `Dev`, `tools`). One short tweet ran successfully but Clef suggested nothing, so it is in the Inbox unlabeled.                                                   |
| 3b  | Library shows an X link; inspector shows text and images | Verified manually in the real app (X brand, `Name (@handle)` titles, text and thumbnails). Tests: `InspectorPreview.test.tsx`, `itemDisplay.test.ts`.                                                                  |
| 4   | Signed out: explains, creates nothing                    | Verified manually; tests in `clipHandler.test.ts` and `injectButton.test.ts`.                                                                                                                                          |
| 5   | Unreadable tweet: nothing sent                           | Test only (`injectButton.test.ts`). **Not seen on real X.**                                                                                                                                                            |
| 6   | One button per tweet, survives scroll/nav                | Verified manually (infinite scroll and in-app navigation); tests in `injectButton.test.ts`.                                                                                                                            |
| 7   | Extension typecheck, test, firefox build                 | All pass (above).                                                                                                                                                                                                      |
| 8   | Firefox sign-in works                                    | Verified in Firefox: sign-in in the popup, token for the `convex` template, `items.create` from the background script.                                                                                                 |

## Findings and deviations

- **Firefox builds as MV3.** WXT's default Firefox MV2 background is an IIFE, which cannot bundle Clerk's dynamic imports.
  `build:firefox` and `dev:firefox` pass `--mv3`; the background entry sets `type: "module"`.
- **`@clerk/chrome-extension/background` is deprecated** in 3.1.90. The code uses `createClerkClient` from `/client`
  with `{ background: true }`.
- **A cached Clerk client missed a later sign-in.** The first background handler kept one client for its lifetime and
  reported `signed_out` after the user had signed in. `tokenProvider.ts` now reloads the client once when it sees no
  session.
- **Entrypoint code must be inside `main()`.** A module-level `ConvexHttpClient` made `wxt build` and `wxt prepare`
  never exit, because WXT imports entrypoints in Node at build time.
- **Clerk dashboard:** no change was reported as needed for the fixed gecko id `clipper@mindspool.local`.
- **`@mindspool/backend` is a workspace dependency of the extension** (it was planned for later) so the generated API
  types the clip arguments.
- **Stored assets from clients are rejected** in `items.create` (not in the spec): clients may only reference external
  images.
- **Running it:** `dev:firefox` does not load the add-on when a normal Firefox is already open (it joins that instance).
  Load `.output/firefox-mv3/manifest.json` from `about:debugging` instead, and never the `-dev` folder, which needs the
  dev server.
- **Quoted tweets leaked their media (found in the walk-through).** On a tweet that quotes a video, the quote's
  thumbnail was clipped as the tweet's image. X does not mark the quote with `data-testid="quoteTweet"` as the first
  fixtures assumed. The parser now treats everything after the article's second `User-Name` as the quote; two fixtures
  with real-style markup cover it (`quoted-thumb-only`, `quoted-outer-photo`). Re-checked on real X after reloading the add-on: the quote's thumbnail is no longer clipped. (An
  earlier re-clip still showed it because the old build was still loaded; reload the add-on after every rebuild.) Items
  clipped before the fix keep their stored image, because a repeat clip returns the stored item unchanged; delete and
  re-clip to see the corrected result.
- **Videos are not clipped.** A tweet's own video has no `tweetPhoto`, so only its text is saved. Not in scope.
- **Not in the spec's scope, left as is:** the popup shows "Loading sign-in…" briefly while Clerk starts.

## Not checked

- The AI limit case in real use (covered by the ai-limit module's own tests).
- An unreadable tweet on real X.
- A reply tweet on real X (not separately recorded).
- X's real markup can drift; fixtures are snapshots. The parser and button depend on `data-testid` values
  (`tweet`, `User-Name`, `tweetText`, `tweetPhoto`) and the action bar's `role="group"`.
