# Tasks: extension-clipper

Plan: [plan.md](extension-clipper-plan.md). Spec: [SPEC-extension-clipper.md](../../SPEC-extension-clipper.md). One task per turn; stop at
checkpoints. Focused tests: `pnpm --filter @mindspool/backend test`, `pnpm --filter @mindspool/web test`,
`pnpm --filter @mindspool/extension test`. Typecheck: `pnpm typecheck`. Build: `pnpm build`,
`pnpm --filter @mindspool/extension build:firefox`. Full: `pnpm check`. Dependencies `convex` and `vitest` in
`apps/extension` and the additive `items.create`/`items.detail` changes are approved with the plan; anything else (other
dependency, schema or index change, Clerk/Convex auth config) needs a question first. Regenerate `convex/_generated`
when function signatures change.

**Per task:** load the listed `Skills` first (TDD: failing test, then code). Always finish with
`verification-before-completion` (run the Verify commands, report real output). `pnpm check` currently fails
`format:check` only on `.mcp.json` (pre-existing); report it as such. Commit only when asked.

## Phase 1: Extension setup and auth spike

- [x] **T1: Dependencies, Vitest, manifest** (S)
  - Add `convex` and `vitest` to `apps/extension` (versions matching `apps/web` and `packages/backend`), a `test`
    script (`vitest run`), and `@mindspool/backend` as a type-only workspace dependency if needed for the generated API.
    In `wxt.config.ts`: `browser_specific_settings.gecko.id = "clipper@mindspool.local"`, `host_permissions` for
    `*://x.com/*`, `*://twitter.com/*` and the Convex URL origin. Add `WXT_PUBLIC_CONVEX_URL` to `.env.example` and
    `env.d.ts`.
  - Acceptance: `build:firefox` and `build` succeed; the built Firefox manifest has the gecko id and the host
    permissions; `pnpm --filter @mindspool/extension test` runs (no tests yet is fine with `--passWithNoTests`).
  - Verify: `pnpm --filter @mindspool/extension build:firefox`; read `.output/firefox-mv*/manifest.json`; `pnpm typecheck`.
  - Files: `apps/extension/package.json`, `wxt.config.ts`, `.env.example`, `env.d.ts`, `pnpm-lock.yaml`.
  - Skills: `source-driven-development` (WXT manifest options, Clerk extension docs).

- [x] **T2: Auth spike** (M)
  - `entrypoints/background.ts`: create the Clerk background client, get a token for the `convex` template, make one
    `ConvexHttpClient` call to `items.create` (`url` item, `captureKey: "spike:<timestamp>"`) triggered from a temporary
    popup button "Test clip". This is throwaway wiring to be replaced in T8; the spike item is deleted afterwards.
  - Acceptance: on Firefox (temporary add-on via `wxt -b firefox`), signed in through the popup, the button creates an
    item visible in the web app; signed out, it reports `signed_out` without creating anything. If Firefox sign-in
    fails, the failure and error text are recorded and I stop and ask whether to switch to Chrome.
  - Verify: manual in Firefox (you run it or I drive it where possible); `pnpm --filter @mindspool/extension typecheck`.
  - Files: `entrypoints/background.ts`, `entrypoints/popup/main.tsx` (temporary button), `wxt.config.ts` if a permission is missing.
  - Skills: `clerk-chrome-extension-patterns`, `debugging-and-error-recovery`.

### Checkpoint: auth

- [x] Firefox sign-in and one real `items.create` work (or Chrome fallback agreed). Report any Clerk dashboard change needed.

## Phase 2: Backend and web display

- [x] **T3: `items.create` optional fields** (M)
  - Add optional `sourceMetadata`, `extractedText`, `imageAssets` to `create` args using the existing validators. In the
    mutation (beside `validateCapture`): title/author/description/siteName at most 300 characters (description 1,000),
    `extractedText` at most 100,000, at most 10 images, each `external`, `https:`, at most 2,048 characters. Store them on
    insert. Repeat key still returns the stored item unchanged. `searchText` must include them (via the existing
    `refreshItemState`).
  - Acceptance: a created url item with these fields has source kind `x` for an x.com URL, is found by searching the
    tweet text, and gets labeled with a state containing author and tweet text; bad bounds throw `ConvexError` without
    writing; plain captures behave exactly as before; another owner cannot read it.
  - Verify: `pnpm --filter @mindspool/backend test -- items`; `pnpm --filter @mindspool/backend test`; `pnpm typecheck`.
  - Files: `convex/items.ts`, `convex/validators.ts`, `convex/items.test.ts`, `convex/_generated/*`.
  - Skills: `test-driven-development`, `api-and-interface-design`.

- [x] **T4: `items.detail` returns tweet fields** (S)
  - Add `extractedText` and `imageAssets` to `itemDetail` and the `detail` handler.
  - Acceptance: detail returns both when present and omits them otherwise; the "exactly the inspector fields" test is
    updated deliberately; previews are unchanged.
  - Verify: `pnpm --filter @mindspool/backend test -- items`; `pnpm typecheck`.
  - Files: `convex/validators.ts`, `convex/items.ts`, `convex/items.test.ts`, `convex/_generated/*`.
  - Skills: `test-driven-development`.

- [x] **T5: Inspector shows tweet text and images** (M)
  - In `InspectorPreview` (and its mock/test data): for a link with `extractedText`, show author (from
    `sourceMetadata`), the text with line breaks preserved, and image thumbnails (lazy `<img>`, `alt` empty, no storage).
    Plain links and notes are unchanged. Follow existing tokens and the Modernist look (zero radius, Archivo).
  - Acceptance: a clipped tweet shows author, text and up to 10 thumbnails; an item without these renders as before;
    the library row/card shows the title and X brand (already supported, add a test if missing).
  - Verify: `pnpm --filter @mindspool/web test`; `pnpm typecheck`; `pnpm build`.
  - Files: `apps/web/src/inspector/InspectorPreview.tsx`, its test, web mock data.
  - Skills: `frontend-ui-engineering`, `test-driven-development`.

### Checkpoint: backend and web

- [ ] `pnpm typecheck`, backend and web tests green. A tweet-shaped item created with `convex run` displays correctly in
      the app (you check, or I run the app).

## Phase 3: Extraction (pure)

- [x] **T6: `tweet.ts` parser** (M)
  - `parseTweet(article: Element): Tweet | null` returning `{ id, url, author, handle, text, images }`: id and URL from the
    `a[href*="/status/"]` that wraps the `<time>`, name/handle from `[data-testid="User-Name"]`, text from
    `[data-testid="tweetText"]` `innerText` equivalent (links, emoji `img[alt]`, line breaks preserved), images from
    `[data-testid="tweetPhoto"] img` with the `name=` query param set to `large`. Quoted tweets: only the outer tweet
    (ignore anything inside a nested `article` or quote container). Null when there is no id, or no text and no image.
  - Fixtures in `src/__fixtures__/`: plain, with images, reply, quoted. Environment: Vitest with `jsdom` (add as a dev
    dependency; ask me if that is not acceptable) or `happy-dom`.
  - Acceptance: all four fixtures parse to the expected objects; a fixture with no text and no images returns null;
    emoji and newlines survive.
  - Verify: `pnpm --filter @mindspool/extension test`; `pnpm --filter @mindspool/extension typecheck`.
  - Files: `src/tweet.ts`, `src/tweet.test.ts`, `src/__fixtures__/*`, `package.json` (test DOM env).
  - Skills: `test-driven-development`.

- [x] **T7: `clip.ts` builder** (S)
  - `buildClip(tweet): ClipArgs` as in the spec's code style snippet. `captureKey` is `x:<id>`; empty `images` gives an empty
    array; title is `Name (@handle)`.
  - Acceptance: output matches `items.create` args exactly (type-checked against the generated API); stable for the same
    tweet; no mutation of input.
  - Verify: `pnpm --filter @mindspool/extension test`; `pnpm typecheck`.
  - Files: `src/clip.ts`, `src/clip.test.ts`.
  - Skills: `test-driven-development`.

## Phase 4: Clipping end to end

- [x] **T8: Background clip handler** (M)
  - Replace the spike call with a `clip` message handler: build the call from `ClipArgs`, send, reply
    `{ ok: true, itemId }` or `{ ok: false, reason }` (`signed_out`, `invalid`, `network`, `unknown`). Remove the temporary
    popup button. No tweet text or tokens in logs.
  - Acceptance: messages with valid args create or replay an item; no session replies `signed_out`; a `ConvexError`
    validation failure maps to `invalid`; handler logic is unit-tested with a fake Convex client.
  - Verify: `pnpm --filter @mindspool/extension test`; `pnpm --filter @mindspool/extension build:firefox`; `pnpm typecheck`.
  - Files: `entrypoints/background.ts`, `src/messages.ts` (shared message types), tests, `entrypoints/popup/main.tsx`.
  - Skills: `test-driven-development`, `security-and-hardening` (token handling).

- [x] **T9: Content script** (M)
  - `entrypoints/x.content.ts` (matches x.com and twitter.com): `MutationObserver` adds one Clip button to each tweet's
    action bar (marked with a data attribute so it is added once), click -> `parseTweet` -> `buildClip` -> message ->
    button states idle / "Clipping…" / "Clipped" / error text, reset after 3 s. Unreadable tweet shows "Couldn't read this
    tweet" and sends nothing. Signed out shows "Sign in via the extension popup". Styling inline or injected CSS only.
  - Acceptance: one button per tweet, still one after scrolling and in-app navigation; states behave as above;
    observer and click wiring unit-tested against a fixture page with a stubbed `browser.runtime.sendMessage`.
  - Verify: `pnpm --filter @mindspool/extension test`; `pnpm --filter @mindspool/extension build:firefox`; `pnpm typecheck`.
  - Files: `entrypoints/x.content.ts`, `src/injectButton.ts`, tests.
  - Skills: `incremental-implementation`, `test-driven-development`.

- [x] **T10: Popup status and link** (S)
  - Signed-in popup shows "Clipping on x.com is on" and a link to the web app (`WXT_PUBLIC_WEB_URL`, default
    `http://localhost:5173`); signed-out keeps the Sign in button.
  - Acceptance: renders both states; no change to the Clerk setup.
  - Verify: `pnpm --filter @mindspool/extension typecheck`; build; visual check in Firefox.
  - Files: `entrypoints/popup/main.tsx`, `.env.example`, `env.d.ts`.
  - Skills: `frontend-ui-engineering`.

### Checkpoint: end to end

- [ ] A real tweet clipped in Firefox appears in `/library` as an X link and is labeled by Clef.

## Phase 5: Verification and docs

- [x] **T11: Walk-through, report, README, archive** (S)
  - Run the manual checklist from the spec (five varied tweets, repeat clip, signed out, unreadable tweet, AI limit,
    infinite scroll, in-app navigation), adjust parser and fixtures for any DOM drift, write
    `docs/verification/extension-clipper.md` with real results (what passed, what did not, Firefox auth outcome, Clerk
    dashboard settings), update README extension section (Firefox load steps, env vars, status), move `plan.md` and
    `todo.md` to `tasks/archive/extension-clipper-*`, set the spec status to implemented.
  - Acceptance: every success criterion in the spec is marked verified or has an honest note; `pnpm typecheck`, `pnpm test`,
    `pnpm build` pass (`pnpm check` only fails on `.mcp.json` format as before).
  - Verify: `pnpm typecheck && pnpm test && pnpm build`.
  - Files: `docs/verification/extension-clipper.md`, `README.md`, `tasks/*`, `SPEC-extension-clipper.md`.
  - Skills: `verification-before-completion`, `documentation-and-adrs`.
