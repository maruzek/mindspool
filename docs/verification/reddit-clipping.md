# Reddit clipping verification

Date: 2026-10-08. Branch: `reddit-integration`.
Spec: [SPEC-reddit-clipping.md](../../SPEC-reddit-clipping.md).
Plan: [tasks/plan.md](../../tasks/plan.md).
Checklist: [tasks/todo.md](../../tasks/todo.md).

**Status: Task 1 complete. Live Firefox compatibility and identity-only URLs
are established. Implementation begins at Task 2; extension-to-Library
acceptance remains unverified.**

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

| Command                                                                                                               | Result                  | Scope                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `pnpm --filter @mindspool/extension test`                                                                             | Pass: 6 files, 45 tests | Existing X clipper baseline; no Reddit implementation or tests exist yet        |
| `pnpm exec prettier --check SPEC-reddit-clipping.md tasks/plan.md tasks/todo.md docs/verification/reddit-clipping.md` | Pass after formatting   | Documentation only; the initial check found pre-existing spec formatting issues |
| `git diff --check`                                                                                                    | Pass                    | Changed tracked documentation                                                   |

The final backend/schema/web/typecheck/build matrix has not been run for
this feature. No development deployment, codegen, live mutation, or
extension publication was performed.

## Outstanding feasibility evidence

Task 1 fixtures have been reviewed against the observed structural boundaries.
Clicking the native “more replies” control increased comment hosts from 25
to 28 while retaining the same post identity. The subsequent live extension
acceptance matrix must still establish:

- Card and compact feeds, post detail, nested comments, crossposts, gallery,
  video, and spoiler boundaries, including accessible shadow roots.
- Own-post and own-comment extraction boundaries and accessible control
  insertion targets, including tab-focus behavior.
- Newly loaded comments, control replacement, and in-site navigation.
- One deterministic post/comment permalink strategy that opens the intended
  objects in Firefox, consistently across supported views.
- Minimal anonymized post/comment fixtures derived from those observations.

The live investigation is separate from extension acceptance: no Clip or
Keep comment control has been injected and no capture has been saved yet.

## Spec success criteria

| Criteria                                                               | Evidence status                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1–2: Live controls and exact capture payloads                          | Unverified; depends on blocked Task 1                                             |
| 3–4: Owned persistence, canonical identity, and atomic comment merging | Not implemented or verified                                                       |
| 5: Library, inspector, source links, and bounded search                | Not implemented or verified for Reddit captures                                   |
| 6: Initial labeling and AI-limit behavior                              | Not verified for Reddit captures                                                  |
| 7: Error feedback and retry                                            | Not implemented or verified for Reddit captures                                   |
| 8: X/auth regression and required automated matrix                     | Existing extension baseline passes; remaining checks unverified                   |
| 9: Real Firefox verification report                                    | This report records the access blocker; required live evidence remains incomplete |

The live concurrent-save case, second-owner isolation, deletion, unchanged
repeat timestamps, additions without AI reruns, and end-to-end X regression
also remain unverified. No criterion is marked complete from these preliminary
checks.
