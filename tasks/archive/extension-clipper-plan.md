# Implementation Plan: extension-clipper

Spec: [SPEC-extension-clipper.md](../../SPEC-extension-clipper.md). Tasks: [todo.md](extension-clipper-todo.md) (markdown, no external tracker).

## Overview

Turn `apps/extension` into a minimal Firefox-first clipper: a content script adds a Clip button to tweets on x.com, a
background script sends the tweet to Convex `items.create`, and the web inspector shows the tweet properly. Backend
work is a small widening of `items.create` / `items.detail` (existing validators, no schema change).

## Dependency graph

```
extension setup (deps, vitest, gecko id, host permissions)
   └── AUTH SPIKE: background script gets a Clerk token on Firefox and makes one real items.create call   <- biggest risk
backend: items.create optional fields ──┬── items.detail returns extractedText + imageAssets
                                        └── web inspector shows tweet text + images
pure extension code: tweet.ts (DOM -> Tweet) ── clip.ts (Tweet -> create args)   (needs nothing above except vitest)
                       └── background: real clip handler (needs spike + backend + clip.ts)
                              └── content script: button, observer, states (needs tweet.ts + background)
                                     └── popup status line, docs, verification report, manual Firefox walk-through
```

## Architecture decisions

- **Spike first.** Whether `@clerk/chrome-extension` authenticates on Firefox is the only real unknown (the README
  says it is unverified). The spike proves it with a throwaway call before any scraper work, so a fallback to Chrome
  is decided early and cheaply. Backend and pure-code tasks do not depend on it.
- **Background owns the network.** The content script only scrapes and messages; the background script holds the Clerk
  client (`createClerkClient` from `@clerk/chrome-extension/background`, `syncHost` not needed since the popup signs
  in), fetches a `convex`-template token and uses `ConvexHttpClient.setAuth`. No token in the page.
- **Pure core, thin shell.** `tweet.ts` takes an `Element` and returns a plain object; `clip.ts` maps it to the
  `items.create` args. Both are unit-tested against saved HTML fixtures. Entrypoints only wire events.
- **Backend change is additive.** New optional args reuse the validators already in `validators.ts`; bounds are
  enforced in the mutation next to `validateCapture`. Existing callers and idempotency (including
  "stored item returned unchanged on repeat key") are untouched.
- **Detail, not preview.** Only `items.detail` gains `extractedText`/`imageAssets`; list previews stay bounded.
- **Inspector change is local** to `InspectorPreview`; external image URLs are rendered with `<img>`, lazy, no fetch
  or storage by us.
- **Fixtures are hand-built** from the known `data-testid` structure (X markup cannot be fetched headlessly); the real
  DOM is verified in the manual Firefox walk-through, and any drift found there updates the parser and fixtures.

## Task list (summary; details and Verify commands in todo.md)

### Phase 1: Extension setup and auth spike

- [x] T1 Dependencies, Vitest, manifest (gecko id, host permissions, Convex URL env) (S)
- [x] T2 Auth spike: background script gets a token on Firefox and calls `items.create` once (M)

### Checkpoint: auth

- [x] Firefox build loads; one item created from the extension, or Chrome fallback decided with you

### Phase 2: Backend and web display

- [x] T3 `items.create` accepts `sourceMetadata`, `extractedText`, `imageAssets` with bounds (M)
- [x] T4 `items.detail` returns `extractedText` and `imageAssets` (S)
- [x] T5 Inspector shows tweet text and image thumbnails (M)

### Checkpoint: backend and web

- [ ] Backend and web tests, typecheck green; a tweet-shaped item created by hand displays correctly

### Phase 3: Extraction (pure)

- [x] T6 `tweet.ts` parser with four fixtures (M)
- [x] T7 `clip.ts` args builder (S)

### Phase 4: Clipping end to end

- [x] T8 Background `clip` handler (replaces the spike call) (M)
- [x] T9 Content script: button, observer, states (M)
- [x] T10 Popup status line and link to the web app (S)

### Checkpoint: end to end

- [ ] A real tweet clipped in Firefox appears labeled in `/library`

### Phase 5: Verification and docs

- [x] T11 Manual walk-through, verification report, README, archive plan and todo (S)

## Risks and mitigations

| Risk                                        | Effect                       | Mitigation                                                                                         |
| ------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Clerk extension SDK fails on Firefox        | Cannot authenticate          | Spike in T2; fallback Chrome (agreed), WXT builds both                                             |
| Clerk rejects the extension origin          | Sign-in fails                | Fixed gecko id (T1); allow-list the origin in the Clerk dashboard, I will tell you the exact value |
| X DOM differs from fixtures                 | Scraper returns null/garbage | Manual walk-through in T11; fix parser and fixtures together; "Couldn't read this tweet" path      |
| Firefox temporary add-on removed on restart | Reload by hand               | Accepted; `wxt -b firefox` dev mode reloads automatically                                          |
| Image URLs from X expire or hotlink-block   | Thumbnails break             | Acceptable for now; stored as references only, noted in report                                     |
| Long tweets exceed 500 chars sent to Clef   | Truncated labeling input     | Existing, intended `ai-limit` behaviour                                                            |

## Parallelism

T3-T5 (backend/web) and T6-T7 (pure extension code) are independent of each other and of the spike once T1 is done.
I will still run them one per turn in the order above unless you say to group them.

## Open items for the checkpoints

- After T2: whether sign-in works on Firefox (decides Firefox vs Chrome for the rest).
- Any Clerk dashboard setting you must change (origin allow-list) is reported at T2.
