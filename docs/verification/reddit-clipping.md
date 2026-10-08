# Reddit clipping verification

Date: 2026-10-08. Branch: `reddit-integration`.
Spec: [SPEC-reddit-clipping.md](../../SPEC-reddit-clipping.md).
Plan: [tasks/plan.md](../../tasks/plan.md).
Checklist: [tasks/todo.md](../../tasks/todo.md).

**Status: local implementation and automated verification complete. The fresh
review's three important defects are repaired and tested. Live public Firefox
investigation and component smoke checks pass; authenticated extension-to-Library
acceptance, official codegen, and actual concurrent clients remain unverified.**

## Compatibility investigation

The session exposes no callable Firefox or Chrome DevTools connector tools.
Initial local executable and browser-cache checks found cached Chromium and
Playwright Core, but no Firefox executable or cached Firefox runtime.
The user authorized downloading an isolated Firefox runtime. Playwright
Core 1.57.0 downloaded Firefox 144.0.2 (build 1497) into
`/home/martin/.cache/ms-playwright/firefox-1497`. This changes no project
dependency declarations. Local Playwright now provides Firefox automation.

As a preliminary connectivity check, an isolated headless Chromium
153.0.8010.12 browser opened the two public pages already referenced by the
spec. It used the cached Playwright Core 1.57.0 installation and a fresh
browser context, without accessing personal browser profiles or credentials.

| Page                                                                                             | Result                                                                                        |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `https://www.reddit.com/r/firefox/`                                                              | HTTP 200, title `Reddit - Prove your humanity`; challenge page rather than the subreddit feed |
| `https://www.reddit.com/r/firefox/comments/1wzzk6l/mozilla_met_with_microsoft_to_discuss_their/` | HTTP 200, title `Reddit - Prove your humanity`; challenge page rather than the post detail    |

Neither page exposed posts or comments for inspection. No challenge bypass
was attempted. These results establish an access blocker, not selectors,
markup compatibility, post availability, or permalink correctness.
Chromium observations do not satisfy the required Firefox checks.

## Live Firefox findings

Firefox 144.0.2 runs headed through local Playwright Core 1.57.0, in a fresh
isolated context. Reddit's normal page loading succeeded without manual
challenge interaction. No personal browser profile was accessed.

| Case               | Observed evidence                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card feed          | `r/firefox` exposes `shreddit-post` with `id="t3_…"`, `permalink`, `post-title`, `post-type`, `author`, `subreddit-name`, `view-type="cardView"`, and `view-context="SubredditFeed"`                                                            |
| Detail             | The same post has `view-context="CommentsPage"`; title and body are separate light-DOM slots. The post action row is accessible in its open shadow root as `[data-testid="action-row"]`, with native controls and `tabindex="0"`                |
| Compact feed       | Reddit's native View: Card → Compact menu changes the post to `view-type="compactView"`; separate `desktop-cta-row`, `mobile-cta-row`, `thumbnail`, and `expando-content` slots are present                                                     |
| Post URL           | `https://www.reddit.com/comments/1wzzk6l/` redirects to the intended Firefox post, retaining `id="t3_1wzzk6l"`                                                                                                                                  |
| Comment URL        | `https://www.reddit.com/comments/1wzzk6l/_/peh2fdi/` redirects to the intended comment permalink; `thingid="t1_peh2fdi"` has `highlight-variant="reply"`                                                                                        |
| Comment ownership  | `shreddit-comment` supplies `thingid`, `postid`, `permalink`, optional `author`, and `depth`. Its own `[slot="comment"]` and `[slot="actionRow"]` are light DOM inside a `details` element; nested replies have their own comment host and body |
| Gallery            | Firefox post `1wuw3yv` exposes `gallery-carousel`, numbered page slots, `zoomable-img`, and available source image references; decorative background images have `role="presentation"`                                                          |
| Video              | `r/Unexpected` exposes `post-type="video"` and `shreddit-player` with `post-id` and a `poster` attribute; player configuration and private state are not read                                                                                   |
| Crosspost          | `r/crosspost` and post `1wubgc7` expose `post-type="crosspost"`. Embedded media occupies the outer post's `post-media-container` slot without a nested `shreddit-post` host. Media-slot ancestry alone cannot establish outer-media ownership   |
| Spoiler            | `r/onepiece` exposes `spoiler` posts and `shreddit-blurred-container` with `reason="spoiler"`, `blurred`, and separate `blurred`/`revealed` slots. Hidden media contents were not inspected                                                     |
| In-site navigation | Clicking the feed's native `full-post-link` opens the same post detail with 25 loaded comment hosts; the post identity remains stable                                                                                                           |

The title slot wrapper in compact view can be covered by the native
`full-post-link` overlay. Clicking that wrapper timed out; clicking the native
overlay link succeeded. Injected controls need their own positioning above
that overlay and must stop navigation propagation.

The shared contract adopts identity-only post/comment URLs for all views,
regardless of subreddit metadata. The spec is updated accordingly. Minimal
fixtures replace public author names, IDs, titles, text, and media paths;
tracking, configuration payloads, and unrelated markup are omitted.
Declarative shadow templates represent the observed open post roots.

Crosspost media is excluded unless outer ownership can be established;
the verified crosspost remains a valid outer-title snapshot. Unrevealed
blurred wrappers are excluded before reading their contents. Closed roots
are not inspected or instrumented.

## Automated checks

| Command                                            | Result                                       |
| -------------------------------------------------- | -------------------------------------------- |
| `pnpm --filter @mindspool/schema typecheck`        | Pass                                         |
| `pnpm --filter @mindspool/backend test`            | Pass: 19 files, 261 tests                    |
| `pnpm --filter @mindspool/backend typecheck`       | Pass                                         |
| `pnpm --filter @mindspool/extension test`          | Pass after review fixes: 13 files, 112 tests |
| `pnpm --filter @mindspool/extension typecheck`     | Pass                                         |
| `pnpm --filter @mindspool/extension build:firefox` | Pass: Firefox MV3, approximately 1.66 MB     |
| `pnpm --filter @mindspool/extension build`         | Pass: Chrome MV3, approximately 1.66 MB      |
| `pnpm --filter @mindspool/web test`                | Pass: 27 files, 278 tests                    |
| `pnpm --filter @mindspool/web typecheck`           | Pass                                         |
| `pnpm --filter @mindspool/web build`               | Pass                                         |

The extension total includes the 16 shared Reddit identity/projection tests.
Backend coverage proves first capture, validation atomicity, owner isolation,
comment union in both request orders, unchanged-repeat timestamps, preserved
snapshots/manual labels, no AI rerun on additions, AI-limit tolerant first saves,
legacy acquisition, deletion, and bounded list/detail/search projections.
These local tests do not simulate actual deployed OCC contention.

The first matrix ran workspaces concurrently and timed out one existing backend
invariant case at 6.6 seconds against its default 5-second timeout; 260 other
tests passed. The unchanged invariant suite passed alone (20/20), then the entire
backend passed alone (261/261 in 9.71 seconds). No timeout was increased.
The web suite emits existing jsdom `scrollTo` notices and passes.

## Live component smoke checks

The compiled browser-only parser/watcher ran on the inspected public detail page
in the same isolated Firefox 144.0.2 context. Transport was a local fake returning
`signed_out`; no extension authentication or Convex save occurred.

| Check                   | Observed result                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Post/comment controls   | One post button; 25 eligible checkboxes among 28 loaded comment hosts                                                                            |
| Parent/reply selection  | Native Playwright clicks independently selected two comments; no transport call until Clip                                                       |
| Request boundary        | Clip sent exactly two distinct selected snapshots and 1,833 available post-text characters; detail location stayed unchanged                     |
| Feedback/retry          | Signed-out guidance retained both selections; the next request arguments were identical                                                          |
| Focus                   | Native post button received focus in the accessible root; rendered size approximately 51.7 × 27 pixels                                           |
| Cleanup                 | Stopping the watcher removed the comment controls                                                                                                |
| CSS/composed visibility | Synthetic public-DOM probes excluded CSS-hidden and shadow-slot-hidden text, then captured it after same-node reveal; all four assertions passed |

Visibility probes use synthetic text and temporary elements, not real hidden
Reddit contents. jsdom retains stale computed display after changing a shadow
ancestor's inline style; separate hidden/revealed unit fixtures cover both
structures, and Firefox additionally proves the same-node reveal operation.
No selector for an unobserved live spoiler mechanism was invented.

The fresh whole-branch review found three important defects: selections lost
through a same-route rendering gap, stale replacement controls after pending
completion, and CSS-hidden content passing extraction. Each regression first
failed, then passed after repair; the extension's final 112-test suite passes.
Selection painting now updates existing checkboxes without reparsing all comment
text on every local toggle. There were no critical or deferred minor findings.

## Remaining live acceptance

The identified target is **dev: graceful-stork-346**. Backend and web public URLs
agree on `https://graceful-stork-346.eu-west-1.convex.cloud`; no deploy key is set.
The extension has no local public Clerk/Convex configuration. Development push,
codegen, and authenticated live verification require the plan's separate
approval; that approval has been requested. No deployment, codegen, live mutation,
extension signing, or publishing has occurred.

After authorization/configuration, load
`apps/extension/.output/firefox-mv3/manifest.json` in a fresh Firefox profile and
sign in through the popup. Verify feed/detail deduplication, parent plus unrelated
reply capture, later additions and saved-ID reselection, source links, inspector
and bounded search, AI-limit first capture, deletion, navigation during a pending
save, interrupted retry, and existing X clipping. Use two independent
authenticated clients for overlapping/disjoint saves, then verify one item's
comment union, unchanged repeat timestamps, no extra AI run, and second-owner
isolation. Actual contention and authenticated UI results remain unchecked.

## Spec success criteria

| Criteria                                                           | Evidence status                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1–2: Live controls and exact capture payloads                      | Live detail component smoke plus exact fixtures; authenticated extension feed/detail capture remains unverified |
| 3–4: Owned persistence, canonical identity, atomic comment merging | Backend and shared helper tests pass; actual concurrent deployed clients remain unverified                      |
| 5: Library, inspector, source links, bounded search                | Backend/web tests and web build pass; authenticated visible inspector remains unverified                        |
| 6: Initial labeling and AI-limit behavior                          | Backend tests pass; live initial run/limit acceptance remains unverified                                        |
| 7: Error feedback and retry                                        | Extension tests and live fake signed-out transport pass; real lost-response save remains unverified             |
| 8: X/auth regression and required automated matrix                 | All required automated commands pass; real Firefox X/auth regression remains unverified                         |
| 9: Real Firefox verification report                                | Compatibility and component evidence recorded; full authenticated matrix remains incomplete                     |

The checklist records automated and live checks separately. No live criterion is
marked complete from fixture tests or the fake transport.
