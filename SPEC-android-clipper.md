# Spec: android-clipper

Status: **implemented in code, not verified on a device** (2026-10-10; see [docs/verification/android-clipper.md](docs/verification/android-clipper.md)); plan in [tasks/plan.md](tasks/plan.md). Single capability: the Expo Android app as a share-target clipper. No capability map needed.

Inputs: [README.md](README.md) (mobile = "primarily a native Android share target"; FxTwitter/VxTwitter for shared X links; roadmap step 4), the Claude Design export `deisgn.html`, section "05 Capture · Android share target" (a post-share **Saved** screen), [SPEC-extension-clipper.md](SPEC-extension-clipper.md), and the current `apps/mobile` (Clerk sign-in only) and `items.create` backend.

## Objective

A signed-in MindSpool user shares an X post from the X Android app (or any app that shares an x.com link) to **MindSpool**. The app turns the share into the same kind of Library item the Firefox extension already produces: post text, author, and image references, saved through `items.create`, then labeled by the existing Clef flow. If the content cannot be fetched, the link is still saved as a bookmark.

Success: share a tweet with text and photos in the X app, tap MindSpool, see "Saved" within about 3 seconds, and find one item in the web Library with the X brand, `Name (@handle)` title, text, and image thumbnails.

In v1 also: a **small in-app Library list** (design section 05, right-hand phone) so a saved item can be seen, with each row's **labels shown** like the web list. Out of v1: Labels/Inbox tabs, search, item detail, label editing, post-save label chips and note field (design, maybe later), other sources (Instagram, TikTok, Reddit, plain web), shared images/screenshots, video download, notes on save, iOS.

## How to get the data from X (research result)

What the X app actually sends: an `ACTION_SEND` intent with `text/plain` whose `EXTRA_TEXT` is the post link (for example `https://x.com/<user>/status/<id>?s=20`). **It carries no post text or images.** So the app must resolve the post id itself. Options compared:

| Option                                                     | Text | Images | Auth / cost                                  | Verdict                                                                                                               |
| ---------------------------------------------------------- | ---- | ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **FxTwitter API** `api.fxtwitter.com/<user>/status/<id>`   | yes  | yes    | none; 1000 req/min/IP; self-hostable         | **Primary.** Already named in README. Checked 2026-10-10: returns text, author, counts, media for a real post.        |
| **X syndication** `cdn.syndication.twimg.com/tweet-result` | yes  | yes    | none; undocumented, needs a computed `token` | **Fallback.** Checked 2026-10-10: returns JSON for id 20. Token formula has changed before; may break without notice. |
| Official X API                                             | yes  | yes    | paid, key management                         | Rejected for a personal app.                                                                                          |
| Hidden WebView of the logged-in X site                     | yes  | yes    | user session; against X terms; fragile       | Rejected.                                                                                                             |
| Save link only                                             | no   | no     | none                                         | **Last resort**, always available (README: retain bookmarks when extraction fails).                                   |

Decision (confirmed): **resolve on the device** (phone calls FxTwitter, then syndication, then saves the bare link), and send the result to the unchanged `items.create`. This needs no backend change, avoids cloud-IP blocking concerns, and mirrors the extension. A backend-side resolver (Convex action) would allow later re-enrichment of link-only saves and is listed as future work.

Not yet verified (Task 1 spike, before any UI): the exact FxTwitter media fields for photos, multi-photo, video poster, quote posts, and long ("note") posts; the 4-image behavior; behavior for deleted/protected posts. Do not guess field names.

## Assumptions requiring review

1. Android only; Expo SDK 57 (already installed), development build (no Expo Go), package `com.mindspool.app`.
2. Share intake uses `expo-share-intent` v8 (approved) (documents SDK 57 support, Android `text/*` intent filter via config plugin). It is a new dependency and needs approval; the fallback is a small local Expo config plugin plus native module, which is much more work.
3. Only `text/plain` shares are registered in v1, so MindSpool does not appear when sharing a raw image.
4. Saving starts **automatically** on receipt of a share (a clipper should be one tap). The user sees the result and taps **Done**, which returns to the previous app. No confirmation step before saving.
5. Items are saved with `captureSource: "mobile"`, `inputType: "url"`, `captureKey: "x:<id>"`, matching the extension's key format.
6. **Cross-client duplicates (decided).** The backend returns `CONFLICT` when the same `captureKey` is saved with a different `captureSource` or `originalInput`. Sharing a tweet already clipped from Firefox would therefore fail. Decision: treat `CONFLICT` as "already saved" in the app (success screen, nothing changed) and normalize `originalInput` exactly like the extension (`https://x.com/<handle>/status/<id>`, handle from the post's author, no query). No backend change.
7. Image URLs are saved as external references with the same `?name=large` normalization the extension applies, at most ten.
8. Auth reuses the existing Clerk Expo setup. Because the Library list must update live (labels arrive after Clef runs), the app uses `ConvexReactClient` with `ConvexProviderWithClerk`, and the share save is a normal `useMutation(api.items.create)`. `EXPO_PUBLIC_CONVEX_URL` becomes required.
9. **Component reuse.** `packages/ui` is DOM/Tailwind and cannot run in React Native. Reuse therefore means: move web-local pure logic (`itemDisplay.ts`: title, host, brand, kind, relative date) into `packages/schema` and import it from both apps; reuse the backend `items.list` preview query unchanged (it already returns labels, `labelCount`, `labeling`, `enrichmentStatus`); and port the `ItemRow`, `LabelTag`, `ItemThumb`, `ProcessingStatus` structure and `--ms-*` tokens to RN components rather than inventing a new look. Anything already in the repo is reused before anything new is written.
10. **Agent guidance.** Implementers must load and follow the relevant Expo skills (`expo-overview`, `expo-dev-client`, `expo-native-ui`, `expo-design-system`, `expo-data-fetching`, `expo-project-structure`, `clerk-expo`, `eas-simulator`) and Convex skills (`convex`, `convex-expert`, `convex-docs`, `convex-test`, `convex-verify`, `convex-reviewer`) wherever they apply, and prefer them over memory.
11. Navigation without a new dependency: a plain state switch between Library and Saved screens (no `expo-router` in v1).

## User experience

- **Share target:** MindSpool appears in the Android share sheet for text shares. Cold start and an already-open app both work.
- **Signed out:** the share is kept in memory, the app shows the existing sign-in, and the save runs after sign-in. A share is never silently dropped.
- **Saved screen** (from the design, minus unbuilt parts): check mark and "Saved", a preview card (source icon, `x.com`, title or text excerpt, first image), the line "You can close this, labeling continues.", and **Done**. Design's live label chips and note field are deferred.
- **States:** `Saving…` → `Saved` | `Saved as link` (fetch failed, bookmark kept, with a Retry fetch action only if cheap) | `Already saved` | error with Retry.
- **Unsupported share** (not an x.com/twitter.com status link): v1 saves nothing and says "Only X posts are supported yet" (decided: refuse).
- **Library list (home screen after sign-in):** newest first, paginated (`items.list`, 10 per page, load more on scroll), live. Each row mirrors the web list row: thumb, title (`displayTitle`), source line (brand icon, host, "via …"), processing status, **labels always visible** (confirmed labels, unsure styled as suggested, `+N` overflow, `Labeling…` while a run is in flight), relative date. Tapping a row opens the source URL in the browser. Empty state and pull-to-refresh not required; loading and error states are. After a successful share, **Done** returns to the list with the new item at the top.
- Share while a save is in progress queues; each share produces exactly one request.
- Failures: no network → "No connection, try again"; too large → "This capture is too large to save"; other → "Something went wrong". Retry reuses the already-fetched payload.

## Content contract

Produces exactly the extension's X payload (see `apps/extension/src/clip.ts`):

| Field            | Value                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `originalInput`  | `https://x.com/<handle>/status/<id>` (accepts x.com, twitter.com, mobile., fxtwitter.com, vxtwitter.com inputs; tracking params and `?s=` stripped) |
| `captureKey`     | `x:<id>`                                                                                                                                            |
| `sourceMetadata` | `title: "<Name> (@<handle>)"`, `author: <handle>`, `siteName: "X"`                                                                                  |
| `extractedText`  | the post's full text (long posts too), no truncation; over 100,000 chars is an error                                                                |
| `imageAssets`    | the post's own photos, https, deduped, max ten, `{kind:"external", purpose:"image"}`; video posts use the poster if available                       |
| quote posts      | outer post only (the extension's rule); the quoted post's text and media are not merged                                                             |

If the post resolves but has neither text nor images, save the link only. If neither resolver works, save the link with `sourceMetadata.siteName: "X"` and no title. A link-only item is never auto-upgraded in v1.

## Tech Stack

Expo ~57.0.26, React Native 0.86.3, React 19.2.3, TypeScript 6.0.3, `@clerk/expo` 4.8.0, Convex 1.46.0 (client only), shared types from `@mindspool/schema`. New (needs approval): `expo-share-intent` ^8, `expo-linking`, `convex` and `lucide-react-native` (+ `react-native-svg`, if not already present) in `apps/mobile`, a test runner (Vitest, as in the other apps) for pure logic.

## Commands

```sh
pnpm dev:mobile                                   # Metro for the dev client
pnpm --filter @mindspool/mobile android           # build + launch on device/emulator (needs Android SDK)
pnpm --filter @mindspool/mobile typecheck
pnpm --filter @mindspool/mobile test              # to be added
pnpm --filter @mindspool/mobile build             # JS bundle only, not an APK
pnpm exec prettier --check SPEC-android-clipper.md
# Simulate an X share without the X app:
adb shell am start -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "https://x.com/jack/status/20?s=20" com.mindspool.app
```

## Project Structure

```text
apps/mobile/app.json                  share-intent plugin + intent filters
apps/mobile/App.tsx                   providers (Clerk, share intent), screen switch
apps/mobile/src/share/parseShare.ts   share text → {source:"x", id, handle} | unsupported
apps/mobile/src/x/resolvePost.ts      FxTwitter → syndication → null (pure, fetch injected)
apps/mobile/src/x/buildClip.ts        resolved post → items.create args (mirrors extension)
apps/mobile/src/clip/saveClip.ts      auth token + items.create + error mapping
apps/mobile/src/SavedScreen.tsx       Saving / Saved / error UI
apps/mobile/src/library/              LibraryScreen, ItemRow, LabelTag, ItemThumb (RN ports of the web components)
apps/mobile/src/theme.ts              --ms-* palette and type tokens mirrored from packages/ui globals.css
packages/schema/src/itemDisplay.ts    moved from apps/web (shared pure display logic)
apps/mobile/src/**/*.test.ts          unit tests, fixtures of real API responses
docs/verification/android-clipper.md  evidence after implementation
```

Possible later move: share `buildClip` for X into `packages/schema` so the extension and app cannot drift. Not in v1.

## Code Style

Match the extension: strict TypeScript, named exports for helpers, double quotes, semicolons, injected dependencies so logic is testable without React Native.

```ts
export async function resolvePost(
  ref: { id: string; handle: string },
  deps: { fetch: typeof fetch },
): Promise<ResolvedPost | null> {
  return (
    (await fromFxTwitter(ref, deps)) ??
    (await fromSyndication(ref, deps)) ??
    null
  );
}
```

## Testing Strategy

- **Unit (Vitest, no RN):** `parseShare` (x.com, twitter.com, mobile., fx/vx domains, `?s=20`, text-before-link, non-X, garbage); `resolvePost` against recorded real FxTwitter and syndication JSON fixtures (text only, 1–4 photos, video, quote, long post, deleted, protected, 404, 429, malformed); `buildClip` exact payloads equal to the extension's for the same tweet; error mapping including `CONFLICT` → already saved.
- **Component:** `SavedScreen` states with React Native Testing Library (new dev dependency, ask first) or kept logic-only if declined.
- **On-device (required, manual):** dev build on a real Android phone: share from the X app a text post, a multi-photo post, a quote post, a video post, a long post, and a deleted post; cold start and warm start; signed-out then sign-in; airplane mode; re-share of a tweet already clipped from Firefox. Record results in `docs/verification/android-clipper.md`. Emulator with `adb` intent is supplementary only.
- Clerk native sign-in and session persistence on a device are still unverified (README); this spec depends on them and the first task must confirm them.

## Boundaries

- **Always:** one request per share; keep tokens in Clerk's secure store; send only to the owner's Convex backend; normalize identically to the extension; respect existing size limits; distinguish automated evidence from on-device evidence.
- **Ask first:** adding dependencies (`expo-share-intent`, `convex`, test libraries); any backend or schema change (including relaxing `CONFLICT` for cross-client X dedupe); registering `image/*` intent filters; a backend-side resolver; hosting our own FxEmbed instance; Play Store signing or publishing; EAS config.
- **Never:** scrape X with a logged-in session or cookies; use the paid X API keys; commit keys or `.env` files; log post content or tokens; auto-clip without a share; remove failing tests.

## Success Criteria

1. On a physical Android device, MindSpool appears in the share sheet for an X post and opens on share (cold and warm).
2. A text-only post, a multi-photo post, and a long post each produce one Library item whose title, text, and image thumbnails match the extension's output for the same post.
3. A video post saves its text and poster image if exposed; otherwise text only.
4. Quote posts save only the outer post.
5. With both resolvers failing (airplane mode after parse, or blocked), the link is saved and the screen says "Saved as link"; with no network at all, the app shows a retryable error and creates nothing.
6. Sharing a tweet already clipped from Firefox shows "Already saved" and creates no second item.
7. Signed out: the share survives sign-in and is saved afterward.
8. Re-sharing the same tweet creates no duplicate; the saved item is labeled by the existing Clef flow.
9. Non-X shares save nothing without an explicit user choice.
10. After sign-in the Library list shows the user's items with labels visible in every row, updating live when Clef finishes; a just-shared item appears at the top.
11. `itemDisplay` is shared by web and mobile with the web tests still passing.
12. `pnpm typecheck`, mobile tests, and `pnpm check` pass; the spike confirms FxTwitter field names with recorded fixtures.

## Change (2026-10-10, after first device run): background share

The app must not open on a share. A translucent `ShareActivity` (config plugin `apps/mobile/plugins/withBackgroundShare.js`) receives `text/plain`, runs a separate `share` React component that saves the post and shows Android toasts ("Saving to MindSpool…", then Saved / Saved the link / Already saved / an error), and finishes, so the user stays in X. This replaces the in-app Saved screen, the share queue and `expo-share-intent` (removed). Signed out: a toast asks the user to sign in in MindSpool and share again (the share is not kept). There is no retry button; the user shares again. A cold share starts the JS runtime in the background, so it can take a second or two. It cannot be tested with the development client on a cold start (no Metro bundle without the launcher); use an EAS `preview` build.

## Decisions (from review, 2026-10-10)

1. Lookup runs on the phone. 2. Cross-client duplicate shows "Already saved"; no backend change. 3. `expo-share-intent` and `convex` approved. 4. Non-X links refused. 5. No label chips or note field after save. 6. Small in-app Library list included, with labels visible.

## Open Questions

1. Icon library for RN (`lucide-react-native`, matching the web's lucide icons) is assumed; confirm when Task 1 lists exact new packages.
