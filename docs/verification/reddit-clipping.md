# Reddit clipping verification

Date: 2026-10-08. Branch: `reddit-integration`.
Spec: [SPEC-reddit-clipping.md](../../SPEC-reddit-clipping.md).
Plan: [tasks/plan.md](../../tasks/plan.md).
Checklist: [tasks/todo.md](../../tasks/todo.md).

**Status: implemented, deployed to the authorized development target, and
verified through the real Firefox extension and web Library. All 651 automated
tests pass. Concurrent extension clients, second-owner isolation, retries,
navigation, media boundaries, and AI-limit capture pass. The user chose to leave
the remaining real-tweet X regression for manual verification.**

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
| `pnpm --filter @mindspool/extension build:firefox` | Pass: Firefox MV3, approximately 2.71 MB     |
| `pnpm --filter @mindspool/extension build`         | Pass: Chrome MV3, approximately 2.71 MB      |
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

## Authenticated development acceptance

The user authorized the existing **dev: graceful-stork-346** deployment,
configuration, and authenticated verification, then explicitly requested two
dedicated development test accounts. `convex dev --once` and official codegen
succeeded against `https://graceful-stork-346.eu-west-1.convex.cloud`.
Only the generated API module map changed. Backend, extension, and web typechecks
pass after generation; focused backend regression tests pass (80/80).
Configured Firefox MV3 and Chrome MV3 builds pass (approximately 2.71 MB).
The ignored extension environment contains the existing public Clerk/Convex
settings, with no secret key.

Clerk CLI created two users in the existing MindSpool development instance,
using explicit development targeting and dry runs. Password sign-in and the
normal new-device verification flow succeeded in the extension and web app.
Clerk's [development test email convention](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)
provided the verification code without sending email. No authentication policy
was changed. Generated passwords stayed in ignored, protected scratch files.

The actual configured add-on was temporarily installed in an isolated headed
Firefox 144.0.2 profile. Native Marionette automated normal UI interactions;
Playwright/Juggler and Marionette were not mixed for acceptance. Public DOM
inspection accessed no private Reddit state or personal browser profile.
Actual saves used the extension's authenticated background transport. Separate
read-only assertions used the development CLI with the dedicated test owners;
no browser tokens were extracted. A local Vite server supplied the web Library.

| Check                           | Observed result                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected comments               | Native detail clicks selected a parent and an unrelated nested reply on post `1wzzk6l`. Only their two snapshots reached the backend; success cleared the selection.                                                                                                                                                                                     |
| Additive save                   | Selecting the saved parent plus a third comment retained one item with three unique snapshots. First comments, post, metadata, images, and creation time stayed unchanged; additions advanced `updatedAt`.                                                                                                                                               |
| Inspector                       | The authenticated web inspector rendered one post section and three comment blocks, without flattened duplicates. Source links matched the selected comment IDs, with HTTPS, `_blank`, and `noopener noreferrer`.                                                                                                                                        |
| Concurrent clients              | Two independent authenticated extension tabs scheduled overlapping requests for synthetic post `qatest01`: comments 1+2 and 2+3. Both returned the same item ID; addition counts were 2 and 1, and the final item contained all three IDs exactly once. No automatic AI run was created.                                                                 |
| Repeat                          | Repeating the concurrent request returned zero additions and left the entire document, including timestamps, unchanged.                                                                                                                                                                                                                                  |
| Ownership                       | The second user saved an independent item for the same synthetic post and a separate real-post capture. The first user's item stayed unchanged. Foreign `get` returned `NOT_FOUND`; foreign detail returned null.                                                                                                                                        |
| Search/projections              | Short saved comment text was found by full-library search. List/search previews omitted structured comment payloads. Existing search limits remain unchanged.                                                                                                                                                                                            |
| Feed/detail                     | Card and compact feeds and detail exposed controls. Both feed Clip controls succeeded with native pointer input without opening the post; feed/detail repeat retained the same item and snapshots.                                                                                                                                                       |
| Image                           | Post `1wup3e1` saved one image reference with no comments, and completed one initial classification run. Later selected-comment additions retained the first media and the same run.                                                                                                                                                                     |
| Gallery                         | Post `1wuw3yv` saved available own text/link and one eligible image reference.                                                                                                                                                                                                                                                                           |
| Video                           | Post `1x020zn` saved a poster image reference and outbound link, with no player UI text.                                                                                                                                                                                                                                                                 |
| Crosspost                       | Post `1wubgc7` saved the outer title, with no embedded body or images.                                                                                                                                                                                                                                                                                   |
| Unrevealed spoiler              | Post `1x0xefl` saved no hidden body text or images.                                                                                                                                                                                                                                                                                                      |
| New replies                     | Native “10 more replies” loading added five eligible controls; all started unchecked.                                                                                                                                                                                                                                                                    |
| Signed out                      | Signing out of the real popup made Clip show sign-in guidance and retain the selected comment. Signing in as the second test user and retrying succeeded.                                                                                                                                                                                                |
| Size error                      | An authenticated synthetic 100,001-character request returned only `invalid` / `content_too_large`; no item was created.                                                                                                                                                                                                                                 |
| Network retry                   | Offline mode in the isolated Firefox produced “No connection, try again” and retained selection. Restoring connectivity and retrying showed Clipped and cleared it; no duplicate or extra AI run appeared.                                                                                                                                               |
| Replacement while pending       | Replacing the public post host immediately after starting a real save preserved one current button. Completion left it enabled, showing Clipped, with selection cleared.                                                                                                                                                                                 |
| Navigation/interrupted response | Navigation started while the real save was pending. The selected comment committed, the new post started unselected, and retrying the same comment after returning left the entire saved document unchanged.                                                                                                                                             |
| AI limit                        | An append-only budget fixture affected only test owner A's previously absent daily usage row. With a label and usage at the existing 9,000-neuron limit, native Clip still saved the gallery. One classification run recorded “Daily AI limit reached”; capture succeeded. No shared budget setting changed and no paid budget exhaustion was performed. |
| Deletion                        | Removing owner B's synthetic discussion removed its detail and list entry; owner A's independent item stayed unchanged.                                                                                                                                                                                                                                  |
| X transport                     | The real authenticated background's unchanged `clip` path saved and replayed a synthetic X payload to the same item ID, with X source kind and no Reddit field. This synthetic item was then deleted.                                                                                                                                                    |

The concurrency case uses synthetic content on the actual development deployment.
It demonstrates simultaneous independent clients and their resulting union; it
does not claim that logs proved a forced OCC conflict. The network/lifecycle
cases inspect stored snapshots and current selections, in addition to feedback.

The AI-limit fixture is deliberate test state for a dedicated account's UTC day;
it does not represent paid AI consumption. Real captures and dedicated accounts
remain available for development review. Temporary test credentials and browser
artifacts are removed after verification.

## Remaining manual check

Opening `https://x.com/OpenAI` in the isolated Firefox displayed X's sign-in gate
and zero tweet articles. The user explicitly chose **“Leave this check documented
for my manual verification.”** Real-tweet parsing/injection regression on this
branch therefore remains unchecked. Existing X tests, the authenticated synthetic
transport check, and [the previous real-X report](extension-clipper.md) provide
separate evidence, not a substitute for this remaining check.

To complete it, load `apps/extension/.output/firefox-mv3/manifest.json`, sign in to
the extension and X, clip a real tweet with text/media, then repeat it. Confirm one
X-branded Library item with the expected text/images and no duplicate or Reddit
comment section. Record the result here.

## Spec success criteria

| Criteria                                                           | Evidence status                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–2: Live controls and exact capture payloads                      | Real configured Firefox detail/compact capture, selected parent/reply, loaded replies, media cases, lifecycle checks; exact fixture payload assertions pass.                   |
| 3–4: Owned persistence, canonical identity, atomic comment merging | Real saves, independent concurrent extension tabs, unchanged repeats, second-owner isolation, deletion, and backend tests pass.                                                |
| 5: Library, inspector, source links, bounded search                | Authenticated three-comment inspector and post-only gallery inspector pass; source links/search/projections and backend/web suites pass.                                       |
| 6: Initial labeling and AI-limit behavior                          | One real initial run succeeded; later additions preserved it. A scoped daily-budget fixture proved a real save succeeds at the limit.                                          |
| 7: Error feedback and retry                                        | Actual signed-out, oversized, offline/retry, pending replacement, navigation/interrupted-response cases pass; invalid/unreadable cases additionally have automated coverage.   |
| 8: X/auth regression and required automated matrix                 | All 651 tests, typechecks, and builds pass. Real extension/web sign-in and synthetic authenticated X transport pass; real-tweet X regression is explicitly handed to the user. |
| 9: Real Firefox verification report                                | Browser, layouts, representative content, authenticated results, and the one remaining manual X gap are recorded above.                                                        |

The checklist keeps the remaining X-dependent criteria unchecked. No fixture,
synthetic payload, or earlier report is represented as a current real-tweet check.
Production deployment, extension signing, and publishing were not performed.

## Implementation ruling

The shared schema workspace includes TypeScript DOM typings so the pure identity
helpers can type-check the universal `URL` API. It imports no browser runtime.
This makes other DOM globals visible to that workspace's compiler, which is the
recorded tradeoff; the helpers themselves use no DOM. No minor review finding
was deferred.
