# Spec: extension-clipper

Status: implemented (see docs/verification/extension-clipper.md for what was and was not checked).

Single-capability feature (no capability map needed). Part of the README's "Real Capture" step, not of the web-redesign
map. Depends on the implemented `clef-labeling` and `ai-limit`. It turns `apps/extension` (today only a sign-in popup)
into a minimal Firefox-first clipper whose purpose is to **test Clef labeling on real tweets**.

## Objective

Let the owner clip a tweet from x.com in one click and see it appear in the web app, labeled by Clef. Success looks
like: on x.com each tweet has a small "Clip" button; clicking it saves the tweet to MindSpool and the button shows
"Clipped"; within a few seconds the item is in `/library` with Clef labels (or "Daily AI limit reached" at the budget).

This is a personal testing tool, not a polished product. Fragility on X's DOM is accepted.

## What I found (facts, not assumptions)

- `apps/extension` is WXT 0.21 + React, one `popup` entrypoint, Clerk sign-in via `@clerk/chrome-extension`. No content
  script, no background script, no Convex client. `build:firefox` exists; the README says Firefox sign-in is
  **unverified** (Clerk's extension SDK is Chrome-oriented).
- `items.create` (`packages/backend/convex/items.ts`) accepts only `{ originalInput, inputType: "url" | "text",
captureSource: "web" | "mobile" | "extension", captureKey }`. It is idempotent per `(owner, captureKey)`, and auto-runs
  `clef-flash` when the owner has at least one label. `captureSource: "extension"` already exists.
- **No enrichment exists** (`enrichmentStatus` stays `not_started`). A `url` item therefore gives Clef only the bare
  URL; a tweet URL carries no topic. So for a tweet to be labelable, **the tweet text must be inside `originalInput`**.
- **The schema already holds what a tweet needs**: `originalUrl`, `sourceMetadata {title, description, author,
siteName}`, `extractedText`, `imageAssets` (external image URLs). `create` just does not accept them yet. Clef's
  state builder already reads `sourceMetadata` and prefers `extractedText` over `originalInput`; `sourceKindOf` already
  maps x.com/twitter.com URLs to source kind `x`; the web app already draws an X brand for such links
  (`itemDisplay.ts`, `InspectorPreview.tsx`).
- `items.detail`/`itemDetail` do not return `extractedText` or `imageAssets`, so the inspector cannot show tweet text
  or images yet.
- Clef gets at most 500 characters per call (`AI_INPUT_CHAR_LIMIT`), so a tweet (280 chars, 25,000 for long posts)
  mostly fits. Text input is capped at 100,000 characters by `validateCapture`.
- Convex verifies Clerk JWTs with `applicationID: "convex"` (a Clerk JWT template named `convex`).

## Assumptions (correct me now or I proceed with these)

1. **Firefox is the target**, built with `wxt build -b firefox`, loaded as a temporary add-on from `about:debugging`.
   Chrome is a free by-product of WXT but is not tested.
2. **Only x.com and twitter.com**, only tweets visible in the timeline, a tweet's own page, and replies. No Instagram,
   TikTok, generic pages, selection clipping or screenshots in this module.
3. **A tweet is saved as a `url` item** (decided: proper display, not a text blob):
   - `originalInput` = `originalUrl` = the tweet URL (`https://x.com/{handle}/status/{id}`)
   - `sourceMetadata` = `{ title: "{author name} (@{handle})", author: "{handle}", siteName: "X" }`
   - `extractedText` = the tweet text
   - `imageAssets` = the tweet's image URLs as `{ kind: "external", url, purpose: "image" }`
     Clef therefore sees title, author and the tweet text (within the 500-character limit). Images are stored as
     references only; they are not fetched or classified (later "Visual Classification" step).
4. **`captureKey` = `x:{tweet id}`**, so clipping the same tweet twice returns the same item (the backend already makes
   this idempotent). The button shows "Clipped" on a repeat click too.
5. **The background script talks to Convex**, not the content script (avoids CORS and keeps the token out of the page).
   It uses `ConvexHttpClient` with a Clerk token from the `convex` template.
6. **Auth is shared with the popup**: the user signs in once in the popup; the background script reads the same Clerk
   session. If it cannot get a token, the button shows "Sign in via the extension popup" and nothing is saved.
7. **New dependencies in `apps/extension`: `convex` and `vitest`** (approved). `convex` provides `ConvexHttpClient` and
   the generated API types from `@mindspool/backend`.
8. **Fixed Firefox add-on id** set through `browser_specific_settings.gecko.id` in the WXT manifest
   (e.g. `clipper@mindspool.local`), so the `moz-extension://` origin Clerk sees stays stable across installs.

## Behaviour

**Content script** (`entrypoints/x.content.ts`, matches `*://x.com/*`, `*://twitter.com/*`):

- Watches the DOM (`MutationObserver`) for `article[data-testid="tweet"]` and adds one Clip button to its action bar
  (`[role="group"]`), once per tweet.
- On click, extracts: tweet id and URL (from the `a[href*="/status/"]` containing the `<time>` element), author name and
  handle (`[data-testid="User-Name"]`), text (`[data-testid="tweetText"]`, `innerText`), image URLs
  (`[data-testid="tweetPhoto"] img`, `name=` size param stripped to `large`), and sends one `clip` message.
- Quoted tweets and retweets: clip the **outer** tweet's own text only. Not a goal to model them.
- If extraction finds no id or no text and no image, the button shows "Couldn't read this tweet" and sends nothing.
- Button states: idle → "Clip", sending → "Clipping…", ok → "Clipped", error → short message; reset after 3 s.

**Background script** (`entrypoints/background.ts`):

- Receives `clip`, gets a Clerk token, calls `items.create` with `inputType: "url"`, `captureSource: "extension"`, the
  tweet URL, `captureKey`, and the optional fields above. Replies `{ ok: true, itemId }` or `{ ok: false, reason }` with `reason` one of
  `signed_out`, `invalid`, `network`, `unknown`. `LIMIT_REACHED` never reaches this path (it does not fail the save).
- Does not log tweet content or tokens.

**Popup**: unchanged except a short status line ("Signed in, clipping on x.com is on") and a link to the web app.

## Backend and web changes (approved by the review, kept minimal)

1. `items.create` accepts optional `sourceMetadata`, `extractedText` and `imageAssets` (existing validators, no schema
   change), with bounds: title and author at most 300 characters, `extractedText` at most 100,000, at most 10 images,
   image URLs at most 2,048 characters and `https:` only. Existing callers are unaffected. If an item already exists
   for the capture key, the stored item is returned unchanged (current behaviour).
2. `items.detail` returns `extractedText` and `imageAssets` so the inspector can show them.
3. Web inspector (`InspectorPreview`): for a link with `extractedText`, show author, the tweet text and image
   thumbnails (external URLs); the library row/card already shows the title and the X brand. No other redesign.
4. `captureKey`-conflict and ownership rules are untouched.

## Tech Stack

WXT 0.21.4, React 19, TypeScript, `@clerk/chrome-extension` 3.1.90, `convex` (HTTP client), Vitest for the pure
extraction/formatting code. Backend unchanged.

## Commands

```
Dev (Firefox):   pnpm --filter @mindspool/extension exec wxt -b firefox
Build Firefox:   pnpm --filter @mindspool/extension build:firefox
Build Chrome:    pnpm --filter @mindspool/extension build
Typecheck:       pnpm --filter @mindspool/extension typecheck
Test:            pnpm --filter @mindspool/extension test
Repo checks:     pnpm turbo run typecheck test
```

(`test` script and Vitest are added by this module. Per AGENTS.md, read the installed turbo docs before touching turbo
config; this module should not need to.)

## Project Structure

```
apps/extension/
  entrypoints/
    popup/              existing sign-in popup (+ status line)
    background.ts       message handler, token + items.create
    x.content.ts        button injection + click handler for x.com
  src/
    tweet.ts            pure: DOM element -> { id, url, author, handle, text, images } | null
    clip.ts             pure: tweet -> { originalInput, captureKey }
    tweet.test.ts       fixture-based tests (saved tweet HTML in src/__fixtures__/)
    clip.test.ts
  wxt.config.ts         + host_permissions for x.com/twitter.com, + Convex URL, + fixed Firefox add-on id
docs/verification/extension-clipper.md   report, written after implementation
```

## Code Style

Match the repo: TypeScript strict, named exports for helpers, `entrypoints/` default exports as WXT requires, no
comments that restate code, small pure functions that are tested, side effects only in entrypoints.

```ts
export function buildClip(tweet: Tweet): ClipArgs {
  return {
    originalInput: tweet.url,
    inputType: "url",
    captureSource: "extension",
    captureKey: `x:${tweet.id}`,
    sourceMetadata: {
      title: `${tweet.author} (@${tweet.handle})`,
      author: tweet.handle,
      siteName: "X",
    },
    extractedText: tweet.text,
    imageAssets: tweet.images.map((url) => ({
      kind: "external",
      url,
      purpose: "image",
    })),
  };
}
```

## Testing Strategy

- **Unit (Vitest, automated):** `tweet.ts` against 4 saved fixtures (plain tweet, tweet with images, reply, quoted
  tweet); `clip.ts` for formatting, key stability, and image-line handling. No test hits the network or X.
- **Backend (convex-test, in `items.test.ts`):** `create` stores the optional fields and derives source kind `x`;
  rejects over-length/too many/non-https images; repeat call with same key returns the same id; labeling state includes
  author and tweet text; `detail` returns `extractedText` and `imageAssets`; other owners cannot read them.
- **Web (existing Vitest + Testing Library):** inspector shows author, tweet text and images for a clipped link and
  is unchanged for plain links.
- **Manual (real use, the point of the module), recorded in the verification report:** load in Firefox, sign in, clip
  five varied tweets, confirm each appears in `/library` with sensible Clef labels; clip one twice (one item); clip
  while signed out (message, nothing saved); clip at the AI limit (item saved, "Daily AI limit reached").
- X's real DOM is only verified manually; fixtures are snapshots and will rot, which is accepted.

## Boundaries

- **Always:** keep `captureKey` stable per tweet; send tweet content only to the owner's Convex deployment; keep the
  token in the background script; run typecheck and tests before declaring done.
- **Ask first:** any schema change (none planned); fetching/storing images; touching Clerk or Convex auth config; publishing or signing the add-on.
- **Never:** scrape or call X's APIs/network requests (DOM of the already-rendered page only); auto-clip without a
  click; store tweets outside Convex; log tokens or tweet text; commit `.env.local` or the extension key.

## Success Criteria

1. In Firefox, signed in, clicking Clip on a tweet creates exactly one `items` row with `captureSource: "extension"`,
   `inputType: "url"`, `captureKey: "x:<id>"`, source kind `x`, and the metadata, text and images described above.
2. Clipping the same tweet again creates no second item and still shows "Clipped".
3. With at least one label and budget left, the item is labeled by `clef-flash` and appears labeled in `/library`.
   3b. The library shows the tweet as an X link with the author as its title; the inspector shows the tweet text and images.
4. Signed out: the button explains how to sign in; no item is created.
5. Unreadable tweet: nothing is sent and the button says so.
6. The Clip button appears once per tweet and survives infinite scroll and navigation within x.com.
7. `typecheck` and `test` pass for `@mindspool/extension`; `build:firefox` produces a loadable bundle.
8. Firefox sign-in works (or, if it does not, the failure is documented with the chosen workaround; see Open
   Question 2).

## Decisions from review

1. Proper display now (url item + metadata + inspector changes): **yes**.
2. Firefox first, fall back to Chrome if Clerk sign-in fails there: **yes**.
3. `convex` and Vitest dependencies in the extension: **approved**.
4. Clerk `convex` JWT template exists: **yes**. Fixed Firefox add-on id: **I set it** (assumption 8).
5. Labels exist in the dev deployment: **yes**.

## Open Questions

- Clerk may need the extension origin allow-listed (`moz-extension://<uuid>` or the gecko id based origin). Found out
  in the first implementation task; the answer goes in the verification report.
