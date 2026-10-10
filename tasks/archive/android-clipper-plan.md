# Plan: Android clipper (X share target + small Library list)

Source: [SPEC-android-clipper.md](../SPEC-android-clipper.md) (approved with changes, 2026-10-10). Tasks: [todo.md](todo.md). Previous boards plan and tasks are in [archive/](archive/).

## Rules for every implementer

- **Reuse first.** Before writing anything, search the repo. Pure logic is shared through `packages/schema` (move `apps/web/src/library/itemDisplay.ts` there, do not copy it). The backend `items.list` / `items.create` are used unchanged. `packages/ui` is DOM-only, so its `ItemRow`, `LabelTag`, `ItemThumb`, `ProcessingStatus` and the `--ms-*` tokens in `packages/ui/src/styles/globals.css` are **ported** to React Native with the same structure, spacing, zero radius, and Archivo font, not redesigned.
- **Use the skills.** Load and follow as many relevant skills as apply, before relying on memory: Expo (`expo-overview`, `expo-dev-client`, `expo-native-ui`, `expo-design-system`, `expo-data-fetching`, `expo-project-structure`, `eas-simulator`, `clerk-expo`) and Convex (`convex`, `convex-expert`, `convex-docs`, `convex-test`, `convex-verify`, `convex-reviewer`). Also `test-driven-development`, `source-driven-development` for `expo-share-intent` and FxTwitter, and `verification-before-completion`.
- Ask first: new dependencies beyond the approved set, any backend or schema change, `image/*` intent filters, EAS or signing config. No commits or merges unless asked.

## Architecture

```
X app ─share text/plain─▶ Android intent ─▶ expo-share-intent ─▶ parseShare
   parseShare ─▶ resolvePost (FxTwitter → syndication → null) ─▶ buildClip ─▶ api.items.create
                                                                    │ (Clerk JWT via ConvexProviderWithClerk)
Library list ◀── usePaginatedQuery(api.items.list) ◀── Convex (labels arrive live after Clef)
```

Components and dependencies:

| Piece                                    | Depends on                     | Notes                                                                              |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Dev build + Clerk + Convex provider      | —                              | Riskiest unknown (Clerk native on device is unverified). Everything else needs it. |
| FxTwitter/syndication fixtures           | — (parallel with the above)    | Record real JSON; field names are not guessed.                                     |
| `parseShare`, `resolvePost`, `buildClip` | fixtures                       | Pure, injected `fetch`, Vitest. `buildClip` must equal the extension's payload.    |
| Shared `itemDisplay` in schema           | —                              | Move + re-point web imports; web tests stay green.                                 |
| Share intake + save flow + Saved UI      | provider, pure logic           | State switch, no router. `CONFLICT` → "Already saved".                             |
| Library list                             | provider, shared `itemDisplay` | RN ports of web row/tag/thumb; labels always visible (web hides them under 768px). |
| On-device verification                   | all                            | Manual matrix; evidence in `docs/verification/android-clipper.md`.                 |

Parallelizable: fixtures/pure logic, the `itemDisplay` move, and the dev-build spike touch disjoint files. Sequential: save flow and list wait for the provider; verification is last.

## Phases and checkpoints

1. **Foundation** (Tasks 1–3): dev build runs on a device, signed-in user, Convex reachable; shared display logic moved; fixtures recorded. _Checkpoint A:_ `pnpm typecheck`, web tests pass, app signs in on a phone and survives restart.
2. **Clip pipeline** (Tasks 4–6): pure logic tested, then wired to the share intent with the Saved screen. _Checkpoint B:_ `adb` simulated share saves a real tweet into the dev deployment; web Library shows it identical to an extension clip.
3. **Library list** (Tasks 7–8): theme tokens and ported components, then the live paginated list. _Checkpoint C:_ labels visible and updating live on the phone.
4. **Verification** (Task 9): X-app share matrix, record the report, `pnpm check`.

## Risks and mitigations

| Risk                                                                                        | Mitigation                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Clerk native sign-in/session persistence untested on a device                               | Task 1 is a gate; stop and report before building more.                                                                  |
| FxTwitter media fields differ from assumptions; service changes or is down                  | Fixtures from live responses; syndication fallback; link-only last resort; resolver behind one function.                 |
| Syndication token formula changes                                                           | Treated as best-effort fallback only; covered by fixture tests, failure falls through to link-only.                      |
| `expo-share-intent` v8 quirks (cold start, re-delivery of the same intent)                  | Read its docs via `source-driven-development`; reset the intent after handling; manual cold/warm tests.                  |
| X app share text includes extra words around the link                                       | `parseShare` extracts the status URL from free text; tested with variants.                                               |
| Handle casing or `twitter.com` vs `x.com` makes `originalInput` differ from the extension's | One normalizer, tested against the extension's `parseTweet` output format; cross-client re-share is a verification case. |
| Native build environment (Android SDK, device) unavailable to agents                        | Tasks needing a device are marked **manual**; pure logic and typecheck are verifiable without it.                        |
| Moving `itemDisplay` breaks web                                                             | Move in its own task with web tests and typecheck as acceptance.                                                         |
| Search/pagination cost in list                                                              | Reuse `items.list` (page size ≤ 10, bounded reads); no new queries.                                                      |

## Out of scope (do not build)

Labels/Inbox tabs, search, item detail, label editing, notes, post-save label chips, non-X sources, shared images, iOS, backend resolver, Play Store publishing.
