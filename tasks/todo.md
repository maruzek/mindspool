# Tasks: Android clipper

Source: [SPEC-android-clipper.md](../SPEC-android-clipper.md). Plan and rules (reuse components, use Expo and Convex skills): [plan.md](plan.md). Commands run from the repository root. Tasks marked **manual** need a physical Android device; do not claim them done without evidence.

## Phase 1: Foundation

- [ ] **Task 1: Dev build, Clerk, Convex provider (gate)** — manual
  - Status: code done (provider, sign-in screen, `.env.example`, typecheck, bundle); **gate not passed**: needs a device to confirm Clerk native sign-in and session persistence.
  - Acceptance: `apps/mobile` builds as a development client and runs on a device; the user signs in with Clerk's native UI and stays signed in after the app is killed and reopened; `ConvexProviderWithClerk` is mounted and a trivial authenticated query (`api.items.stats`) returns data; `.env.example` documents `EXPO_PUBLIC_CONVEX_URL`.
  - Verify: `pnpm --filter @mindspool/mobile typecheck`; on device: sign in, restart, see stats value. Report any Clerk native problem and stop.
  - Files: `apps/mobile/package.json` (add `convex`), `apps/mobile/App.tsx`, `apps/mobile/src/AuthScreen.tsx`, `apps/mobile/.env.example`, `apps/mobile/app.json`.

- [x] **Task 2: Share `itemDisplay` through `packages/schema`**
  - Status: done. `itemDisplay` + tests in `packages/schema` (schema now has Vitest); web tests (290), typecheck pass.
  - Acceptance: `itemDisplay.ts` and its tests live in `packages/schema/src` and are exported; `apps/web` imports from `@mindspool/schema`; no copy remains in web; behavior unchanged.
  - Verify: `pnpm --filter @mindspool/web test`; `pnpm typecheck`; `pnpm --filter @mindspool/web build`.
  - Files: `packages/schema/src/itemDisplay.ts(+test)`, `packages/schema/src/index.ts`, `apps/web/src/library/*` imports (may exceed five; split imports edits by directory if so).

- [x] **Task 3: Record X API fixtures (spike)**
  - Status: done, field notes in `docs/verification/android-clipper.md`; protected/429/malformed/tombstone fixtures are hand-made. Awaiting user review of the notes.
  - Acceptance: real, anonymized-free (public posts) JSON captured from FxTwitter and syndication for: text-only, one photo, multi-photo (≥3), video, quote post, long post, deleted, protected, plus 404/429/malformed samples (hand-made). A short note in `docs/verification/android-clipper.md` lists the confirmed media/quote/long-text field names and any surprise (e.g. 4-image cap).
  - Verify: fixtures load in a Vitest test that only asserts they parse as JSON; field notes reviewed by the user.
  - Files: `apps/mobile/src/x/__fixtures__/*`, `docs/verification/android-clipper.md`.

**Checkpoint A:** typecheck, web tests, device sign-in persists. Review with the user.

## Phase 2: Clip pipeline

- [x] **Task 4: Test runner and `parseShare`**
  - Status: done. 35 tests.
  - Acceptance: Vitest set up in `apps/mobile` (`pnpm --filter @mindspool/mobile test`); `parseShare(text)` returns `{ id, handle }` for x.com, twitter.com, mobile., fxtwitter.com, vxtwitter.com status links, with `?s=20`, extra words before/after the link; returns `unsupported` for anything else.
  - Verify: `pnpm --filter @mindspool/mobile test`.
  - Files: `apps/mobile/package.json`, `apps/mobile/vitest.config.ts`, `apps/mobile/src/share/parseShare.ts(+test)`.

- [x] **Task 5: `resolvePost` and `buildClip`**
  - Status: done. Syndication cannot return full long-post text (documented, tested).
  - Acceptance: `resolvePost` tries FxTwitter, then syndication, then returns null; every fixture from Task 3 maps to the expected `ResolvedPost` (outer post only, https photos, deduped, max ten, video poster when exposed); `buildClip` output equals the extension's `buildClip` for the same tweet (`originalInput` `https://x.com/<handle>/status/<id>`, `x:<id>`, `Name (@handle)`, `?name=large` images); link-only fallback payload when null.
  - Verify: `pnpm --filter @mindspool/mobile test`; `pnpm --filter @mindspool/mobile typecheck`.
  - Files: `apps/mobile/src/x/resolvePost.ts`, `apps/mobile/src/x/buildClip.ts`, matching tests.

- [ ] **Task 6: Share intake, save flow, Saved screen**
  - Status: code done (plugin, queue, `saveClip` + 12 tests, `SavedScreen`); **manual `adb` share still to run** on a device.
  - Acceptance: `expo-share-intent` plugin and `text/plain` intent filter configured; a share (cold and warm) triggers one `items.create` with `captureSource: "mobile"`; states Saving, Saved, Saved as link, Already saved (`CONFLICT`), retryable error, unsupported-X message; signed-out share is kept and saved after sign-in; the intent is reset after handling; **Done** returns to the previous app or the list. Save logic is a plain function with injected dependencies and unit tests for error mapping.
  - Verify: `pnpm --filter @mindspool/mobile test`; typecheck; **manual:** `adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "https://x.com/jack/status/20?s=20" com.mindspool.app` saves one item visible in the web Library.
  - Files: `apps/mobile/app.json`, `apps/mobile/package.json`, `apps/mobile/App.tsx`, `apps/mobile/src/clip/saveClip.ts(+test)`, `apps/mobile/src/SavedScreen.tsx`.

**Checkpoint B:** simulated share produces an item identical to the extension's; re-share shows "Already saved". Review with the user.

## Phase 3: Library list

- [ ] **Task 7: Theme tokens and ported components**
  - Status: code done (`theme`, ported components, `tags` + tests); **visual check on device pending**.
  - Acceptance: `theme.ts` mirrors the `--ms-*` palette, font, zero radius, 2px rules from `globals.css`; RN `ItemRow`, `LabelTag` (confirmed, suggested/unsure, `+N`, `Labeling…`), `ItemThumb`, `ProcessingStatus`, brand icon mirror the web components' structure and use shared `itemDisplay`; labels render on all widths.
  - Verify: typecheck; unit tests for pure helpers (label overflow, unsure state); visual check on device (**manual**) against the design's phone list.
  - Files: `apps/mobile/src/theme.ts`, `apps/mobile/src/library/{ItemRow,LabelTag,ItemThumb,ProcessingStatus,BrandIcon}.tsx`.

- [ ] **Task 8: Live Library list screen**
  - Status: code done (`LibraryScreen`, `useLibraryItems`); **live-label check on device pending**.
  - Acceptance: after sign-in the home screen lists items newest first via `usePaginatedQuery(api.items.list, {}, { initialNumItems: 10 })`, loads more on scroll, shows loading, empty, and error states; rows show labels and update live when Clef finishes; tapping a row opens `originalUrl`; the just-shared item is at the top after **Done**.
  - Verify: typecheck; `pnpm --filter @mindspool/mobile build`; **manual:** share a tweet, watch `Labeling…` turn into labels without refresh.
  - Files: `apps/mobile/src/library/LibraryScreen.tsx`, `apps/mobile/App.tsx`, `apps/mobile/src/library/useLibraryItems.ts`.

**Checkpoint C:** list matches web labels for the same items. Review with the user.

## Phase 4: Verification

- [ ] **Task 9: On-device matrix and report** — manual
  - Status: not started: needs a device. Report skeleton with every case marked unverified is in place.
  - Acceptance: spec success criteria 1–12 checked with evidence in `docs/verification/android-clipper.md` (device, Android version, X app version): text, multi-photo, long, quote, video, deleted posts; cold/warm start; signed-out then sign-in; airplane mode; re-share of a Firefox-clipped tweet; non-X link. Unverified cases are listed as such. README mobile section and `SPEC-android-clipper.md` status updated.
  - Verify: `pnpm check`; `pnpm exec prettier --check SPEC-android-clipper.md tasks/plan.md tasks/todo.md docs/verification/android-clipper.md`.
  - Files: `docs/verification/android-clipper.md`, `README.md`, `SPEC-android-clipper.md`.

## Change 2026-10-10: background share

Task 6 was reworked after the first device run: the share no longer opens the app. `ShareActivity` (config plugin) + `ShareApp` + toasts replace the Saved screen, queue and `expo-share-intent`. Unverified on a device; needs an EAS `preview` build for cold shares.
