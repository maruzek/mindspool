# Tasks: Reddit post clipping with selected comments

Current revision (2026-10-09): individual comment Clip buttons are planned in
Tasks 16–18 below, awaiting review. Earlier tasks and pending manual X checks
remain intact. See the current revision at the start of [plan.md](plan.md).

Status: implementation, automated verification, and authenticated Reddit development
acceptance complete, 2026-10-08. Concurrent extension clients, owner isolation,
media, retries/navigation, inspector, search, deletion, and AI-limit checks pass.
The user chose to leave real-tweet X regression for manual verification; criteria
containing that check remain unchecked.
See [the investigation report](../docs/verification/reddit-clipping.md).
Spec: [SPEC-reddit-clipping.md](../SPEC-reddit-clipping.md).
Design and API contracts: [plan.md](plan.md).

Use the numbered order by default. Each task must leave existing captures working. Checkpoints require a review of concrete results before proceeding; do not mark live checks complete based on fixture tests. Changes exceeding five files must be split, including generated artifacts.

## Task 1: Establish live Reddit compatibility

**Description:** Inspect current Reddit in Firefox without implementation changes. Establish post/comment ownership boundaries, insertion targets, dynamic-navigation behavior, and one reliable post/comment URL strategy. Save minimal anonymized fixtures representing multiple cases in each fixture file.

**Acceptance criteria:**

- [x] Evidence covers card/compact feeds, detail, nested comments, crossposts, available gallery/video/spoiler media, and new comments/navigation; accessible roots and selector boundaries are recorded.
- [x] Candidate identity-only post/comment URLs open the correct objects, or one deterministic alternative is documented and the spec updated before dependent tasks.
- [x] Fixtures preserve relevant structure while removing private content, identifiers tied to private users, tracking payloads, and unrelated page data.

**Verification:**

- [x] Manual: open the same post from feed and detail, then a nested-comment link; verify IDs/targets and tab-focus insertion opportunities in Firefox.
- [x] Review the evidence and fixtures against the captured DOM; record browser version, view, and unresolved compatibility gaps.

**Dependencies:** None.

**Files likely touched:**

- `docs/verification/reddit-clipping.md`
- `apps/extension/src/__fixtures__/reddit/posts.html`
- `apps/extension/src/__fixtures__/reddit/comments.html`
- `SPEC-reddit-clipping.md`

**Estimated scope:** Medium: 4 files; read-only investigation plus evidence.

### Checkpoint: Feasibility

- [x] Real Firefox evidence supports post/comment extraction and accessible control placement; blockers have a reviewed resolution.
- [x] Post/comment URL normalization has one verified strategy for every supported view.
- [x] Review the compatibility findings before Task 2; do not silently substitute an unverified route or inaccessible-root workaround.

## Task 2: Define shared Reddit identity helpers

**Description:** Implement the reviewed pure domain contract in the schema workspace, exposing identity normalization, canonical URLs, snapshot types, limits, and deterministic text projection. Use the extension's existing test runner for this shared code.

**Acceptance criteria:**

- [x] Helpers produce stable lowercase IDs, `reddit:<id>`, and Task 1's verified URLs across slugs, tracking parameters, fragments, and comment-link variants; invalid/inconsistent identities are rejected.
- [x] Snapshot types and limits match the planned backend contract; projection keeps post/link and selected comment author/text/permalink sections in stable order.
- [x] The shared module has no browser, Clerk, Convex runtime, or new package dependency; existing schema exports remain compatible.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/redditContract.test.ts`
- [x] `pnpm --filter @mindspool/schema typecheck`

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/schema/src/reddit.ts`
- `packages/schema/src/index.ts`
- `apps/extension/src/redditContract.test.ts`

**Estimated scope:** Medium: 3 files.

## Task 3: Persist an initial Reddit capture

**Description:** Add optional structured capture storage and `items.clipReddit`, delivering first-save persistence for a post with zero or selected comments. Share the current insertion/statistics/initial-labeling path through a private helper while keeping `items.create` behavior intact. Until Task 4, repeat saves return the original item without adding comments; extension callers are not enabled yet.

**Acceptance criteria:**

- [x] First save derives owner/key/URLs/source server-side and persists first post metadata/media plus unique comment snapshots; legacy documents remain valid without the optional field.
- [x] Invalid IDs, mismatched post/comment associations, unsafe links, over-limit selection/content/images, and projected item size reject atomically with bounded errors; anonymous saves fail.
- [x] Initial labeling remains best-effort and AI-limit tolerant; stats/state are maintained, and existing web/mobile/X create replay/conflict behavior stays unchanged.

**Verification:**

- [x] `pnpm --filter @mindspool/backend exec vitest run convex/redditCapture.test.ts convex/items.test.ts`
- [x] `pnpm --filter @mindspool/backend typecheck`
- [x] Include title-only, no-label, initial-comments, duplicate-request-ID, and AI-limit cases; assert failed validation leaves no item or counter change.

**Dependencies:** Task 2.

**Files likely touched:**

- `packages/backend/convex/validators.ts`
- `packages/backend/convex/redditCaptureModel.ts`
- `packages/backend/convex/items.ts`
- `packages/backend/convex/redditCapture.test.ts`
- `packages/backend/convex/items.test.ts`

**Estimated scope:** Medium: 5 files.

### Checkpoint: First-save contract

- [x] Shared identity tests, backend capture tests, and affected typechecks pass; existing capture sources are intact.
- [x] Review actual validators/mutation behavior, optional-field compatibility, and byte-size calculation before extending repeated saves.
- [x] The mutation is not exposed through a live Reddit content script until atomic merging is implemented.

## Task 4: Merge newly selected comments atomically

**Description:** Complete repeat-save semantics for the dedicated Reddit endpoint: read the current owned item, append unknown comment IDs, and keep earlier snapshots. Reuse existing item-state refresh without altering AI or labeling policy.

**Acceptance criteria:**

- [x] Same owner/post keeps one item; duplicate/overlapping requests form a comment-ID union, preserving old snapshots and each request's new selection order. Unchanged repeats perform no writes.
- [x] Actual additions update derived text/search state and `updatedAt`, preserve creation time/post/media/labels/manual decisions, and start no automatic AI run; matching legacy extension captures can acquire structured comments without rewriting their post.
- [x] Combined limits are checked before any patch; conflicts/foreign identities reject. Tests cover both merge orders, repeated IDs, another owner's independent capture, deletion, and pending initial labeling.

**Verification:**

- [x] `pnpm --filter @mindspool/backend exec vitest run convex/redditCapture.test.ts convex/items.test.ts convex/itemState.test.ts`
- [x] `pnpm --filter @mindspool/backend typecheck`
- [x] Assert IDs, timestamps, run counts, label decisions, searchable prefix, counters, and old snapshots; reserve actual OCC contention proof for Task 15.

**Dependencies:** Task 3.

**Files likely touched:**

- `packages/backend/convex/redditCaptureModel.ts`
- `packages/backend/convex/items.ts`
- `packages/backend/convex/redditCapture.test.ts`

**Estimated scope:** Medium: 3 files.

## Task 5: Expose owned Reddit inspector detail

**Description:** Extend the existing item detail projection with optional structured post/comment data. Keep list previews bounded. Regenerate official contracts against the selected authorized development target when required by the repository workflow.

**Acceptance criteria:**

- [x] Owned detail includes structured post/comment snapshots; missing/foreign/deleted items retain current behavior and reveal no capture key, owner ID, or run pointers.
- [x] List/search previews omit comment payloads; legacy and non-Reddit detail shapes remain compatible, and deleting an item removes its embedded snapshots.
- [x] Return validators and generated client types agree; generated definitions are produced by codegen rather than hand editing.

**Verification:**

- [x] `pnpm --filter @mindspool/backend exec vitest run convex/redditCapture.test.ts convex/items.test.ts`
- [x] `pnpm --filter @mindspool/backend typecheck`
- [x] After target identification and authorization: `pnpm --filter @mindspool/backend codegen`; inspect only changed generated artifacts and split if the file ceiling would be exceeded.

**Dependencies:** Task 4.

**Files likely touched:**

- `packages/backend/convex/validators.ts`
- `packages/backend/convex/items.ts`
- `packages/backend/convex/redditCapture.test.ts`
- `packages/backend/convex/_generated/api.d.ts` (if codegen changes it)
- `packages/backend/convex/_generated/dataModel.d.ts` (if codegen changes it)

**Estimated scope:** Medium: up to 5 files.

## Task 6: Read selected comments in the inspector

**Description:** Render structured Reddit capture detail with separate post and selected-comment sections. Retain the generic preview for existing links/notes and avoid displaying the flattened projection a second time.

**Acceptance criteria:**

- [x] Post title/metadata/body/link/images and selected comment author/text/permalink are readable in saved order, with no implied captured ancestor/thread hierarchy.
- [x] Text stays plain text; source links are HTTPS Reddit permalinks with safe new-tab attributes, and comments are not duplicated through `extractedText`.
- [x] Post-only, legacy Reddit, X, generic link, and note previews preserve existing behavior; an empty comment selection has no comments section.

**Verification:**

- [x] `pnpm --filter @mindspool/web exec vitest run src/inspector/RedditCapturePreview.test.tsx src/inspector/InspectorPreview.test.tsx`
- [x] `pnpm --filter @mindspool/web typecheck`
- [x] `pnpm --filter @mindspool/web build`

**Dependencies:** Task 5.

**Files likely touched:**

- `apps/web/src/inspector/RedditCapturePreview.tsx`
- `apps/web/src/inspector/RedditCapturePreview.test.tsx`
- `apps/web/src/inspector/InspectorPreview.tsx`
- `apps/web/src/inspector/InspectorPreview.test.tsx`

**Estimated scope:** Medium: 4 files.

### Checkpoint: Saved discussion

- [x] Backend and web suites/typechecks pass and the web builds; one owned capture with comments reads correctly through detail and the inspector.
- [x] Search/counter changes, unchanged repeat behavior, no new AI run on merge, legacy compatibility, and ownership isolation are verified.
- [x] Review the merge and reader results before enabling extension capture. Any live dev verification uses the separately authorized, announced target.

## Task 7: Extract a rendered Reddit post

**Description:** Build a post parser using the verified DOM adapter and map its result to the dedicated Reddit request with an empty selection. Keep fixture-based extraction separate from transport/injection.

**Acceptance criteria:**

- [x] Parse title, ID, optional author/subreddit, available own body/link, and eligible image references across verified feed/detail/compact fixtures; title-only posts remain valid.
- [x] Preserve paragraph/list/emoji text and image URL parameters; exclude embedded crosspost contents, avatars/icons, unselected comments, player UI, and unrevealed spoilers.
- [x] Exact mapped arguments satisfy the API contract and bounds; unusable identity/title fails without side effects and images are unique with at most ten references.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/reddit.test.ts src/redditClip.test.ts src/redditContract.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`

**Dependencies:** Tasks 2 and 3.

**Files likely touched:**

- `apps/extension/src/reddit.ts`
- `apps/extension/src/reddit.test.ts`
- `apps/extension/src/redditClip.ts`
- `apps/extension/src/redditClip.test.ts`
- `apps/extension/src/__fixtures__/reddit/posts.html`

**Estimated scope:** Medium: 5 files.

## Task 8: Send Reddit captures through the background

**Description:** Add the `clip-reddit` message discriminator and mutation dispatch through the existing authenticated transport. Preserve X messages, tokens, and replies while exposing a bounded hint for oversized Reddit captures.

**Acceptance criteria:**

- [x] Reddit requests call `items.clipReddit` using the current Clerk token; X requests still call `items.create`, with no auth/configuration change.
- [x] Runtime checks and sender-ID checks reject unrelated/malformed requests; tokens/content/exception text never enter logs, page code, or responses.
- [x] Success returns the item ID and optional addition count; signed-out, validation/size, network, conflict, and unknown failures map to retryable UI results without falsely confirming a save.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/clipHandler.test.ts src/clip.test.ts src/tokenProvider.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] `pnpm --filter @mindspool/extension build:firefox`

**Dependencies:** Task 4.

**Files likely touched:**

- `apps/extension/src/messages.ts`
- `apps/extension/src/clipHandler.ts`
- `apps/extension/src/clipHandler.test.ts`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/src/clip.ts` (only if separating legacy request aliases is necessary)

**Estimated scope:** Medium: up to 5 files.

## Task 9: Clip posts from Reddit

**Description:** Add the Reddit content script, scoped host matches/permissions, and an accessible post Clip button using empty selections. This is the first usable extension-to-Library slice. Register watcher cleanup from the start.

**Acceptance criteria:**

- [x] One post Clip button appears in supported card/compact/detail controls; native keyboard/focus behavior works and clicking does not activate Reddit navigation/voting.
- [x] Current-post extraction sends one request; busy suppression, three-second success/error feedback, signed-out guidance, and retry work. Observers do not loop on their own changes and clean up on context invalidation.
- [x] Manifest access is limited to `reddit.com`/`www.reddit.com` plus existing hosts; Firefox MV3 and Chrome bundles build, with X behavior preserved.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/injectRedditButton.test.ts src/injectButton.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] `pnpm --filter @mindspool/extension build:firefox` and `pnpm --filter @mindspool/extension build`
- [x] Manual on authorized dev: load `.output/firefox-mv3/manifest.json`, sign in, clip the same post from feed/detail, and confirm one Reddit-branded Library item with captured context.

**Dependencies:** Tasks 7 and 8.

**Files likely touched:**

- `apps/extension/src/injectRedditButton.ts`
- `apps/extension/src/injectRedditButton.test.ts`
- `apps/extension/entrypoints/reddit.content.ts`
- `apps/extension/wxt.config.ts`

**Estimated scope:** Medium: 4 files.

### Checkpoint: Post clipping

- [x] The extension suite/typecheck and both browser builds pass; real Firefox post clipping reaches the authorized dev Library with stable deduplication.
- [ ] Relevant backend/web checks still pass; a post-only capture has no empty comments section and existing X clipping works.
- [x] Review the end-to-end post slice before integrating selected comments.

## Task 10: Extract individual comments

**Description:** Build a comment parser that reads exactly one loaded comment's own content and validates its owning post. Use nested/replaced/deleted comment fixtures from Task 1.

**Acceptance criteria:**

- [x] A readable comment yields normalized ID, owning post ID, optional author, and plain-text body; shared helpers derive its source URL consistently.
- [x] Parent/reply bodies stay separate, with paragraphs/lists/emoji/link text preserved; votes, awards, controls, nested reply text, and unselected neighbors are excluded.
- [x] Unreadable/deleted-empty comments, mismatched identity/post, and inaccessible hidden content are ineligible; deleted author with readable body is allowed.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/redditComment.test.ts src/redditContract.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`

**Dependencies:** Tasks 1 and 2.

**Files likely touched:**

- `apps/extension/src/redditComment.ts`
- `apps/extension/src/redditComment.test.ts`
- `apps/extension/src/__fixtures__/reddit/comments.html`

**Estimated scope:** Medium: 3 files.

## Task 11: Maintain post-scoped comment selections

**Description:** Implement an ordered snapshot store keyed by current post and comment ID, independent of DOM nodes. Handle local selection, limits, pending requests, and navigation generations without persistence or networking.

**Acceptance criteria:**

- [x] Parent/reply selection is independent; duplicate IDs do not increase the count, deselection works at the 20-comment limit, and selected snapshots survive node removal/re-render.
- [x] Same-post re-renders preserve state; navigation away/new post clears it; selecting or deselecting never sends data or removes already saved backend comments.
- [x] Freeze a stable request snapshot while sending; success clears only that request's current generation, failure retains it, and late replies cannot mutate a new post's selections.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/redditSelection.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`

**Dependencies:** Task 10.

**Files likely touched:**

- `apps/extension/src/redditSelection.ts`
- `apps/extension/src/redditSelection.test.ts`

**Estimated scope:** Small: 2 files.

## Task 12: Select comments before clipping

**Description:** Wire native Keep comment checkboxes and the selection count into the post Clip action. Observe only eligible comments belonging to the active detail context and send the frozen selection through the already completed transport.

**Acceptance criteria:**

- [x] One accessible checkbox appears per eligible loaded comment; new comments start unselected, parent/reply checks stay independent, and the count/limit explanation matches stored local selection.
- [x] Clip sends the post plus exactly selected snapshots, including selected nodes later removed from DOM; zero selection saves the post alone, and oversized selection gives deselection/retry guidance without dropping content.
- [x] Success clears the request's selection; failed/unknown save preserves it; later clipping appends new comments to the same item and selecting saved IDs again creates no duplicate comments or AI runs.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/injectRedditComments.test.ts src/injectRedditButton.test.ts src/redditSelection.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] `pnpm --filter @mindspool/extension build:firefox`
- [x] Manual on authorized dev: select a parent and an unrelated nested reply, clip, inspect their source links, then add a third comment and reselect one saved ID; confirm one item with three comments.

**Dependencies:** Tasks 4, 9, and 11.

**Files likely touched:**

- `apps/extension/src/injectRedditComments.ts`
- `apps/extension/src/injectRedditComments.test.ts`
- `apps/extension/src/injectRedditButton.ts`
- `apps/extension/src/injectRedditButton.test.ts`
- `apps/extension/entrypoints/reddit.content.ts`

**Estimated scope:** Medium: 5 files.

### Checkpoint: Selected comments

- [x] Extension tests/typecheck/build pass and the reader/backend checks remain green; the real selected-comments flow works on the authorized development target.
- [x] Loading replies, independent selection, retained failure state, repeat additions, and safe source links are demonstrated; no unselected content is saved.
- [x] Review the selection interaction before lifecycle hardening and final verification.

## Task 13: Harden navigation and ambiguous retries

**Description:** Exercise node recycling, control replacement, late async responses, and interrupted saves across the complete feature. Fix observed lifecycle defects within the existing watchers and verify backend retry behavior alongside them.

**Acceptance criteria:**

- [x] New cards/replies, identity-attribute changes, same-post control replacement, navigation away/back, and detail closing preserve or clear selection as specified, without duplicate controls or observer loops.
- [x] No recycled card or late response reads/saves/clears another post's state; repeated clicks and retry after a lost response preserve item/comment idempotency.
- [x] Cleanup releases observers/handlers/timers and frozen requests behave predictably; existing X interactions and legacy capture replay behavior still pass.

**Verification:**

- [x] `pnpm --filter @mindspool/extension test`
- [x] `pnpm --filter @mindspool/backend exec vitest run convex/redditCapture.test.ts convex/items.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] Manual: navigate to another post during a pending save, replace controls, and interrupt then retry a request; inspect the saved item and current selection, not just button text.

**Dependencies:** Task 12.

**Files likely touched:**

- `apps/extension/src/injectRedditButton.ts`
- `apps/extension/src/injectRedditButton.test.ts`
- `apps/extension/src/injectRedditComments.ts`
- `apps/extension/src/injectRedditComments.test.ts`
- `packages/backend/convex/redditCapture.test.ts`

**Estimated scope:** Medium: 5 files.

## Task 14: Explain supported clipping behavior

**Description:** Update the signed-in popup and concise usage documentation once the feature works. State the supported site/browser, selection interaction, snapshot preservation, external images, and repeated-comment additions.

**Acceptance criteria:**

- [x] Signed-in status mentions X and Reddit while preserving sign-in behavior and the Open MindSpool link.
- [x] Usage instructions explain Keep comment → Clip, the 20-per-save selection limit, adding comments later, first-snapshot preservation, and obtaining fuller post text before first capture.
- [x] Core concepts record optional embedded comment storage and current search/AI budgets; documentation does not claim automatic whole-thread capture, refreshed content, archived media, or full-comment classification.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/ClipStatus.test.tsx`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] Review instructions against the actual working Firefox interaction.

**Dependencies:** Task 13.

**Files likely touched:**

- `apps/extension/src/ClipStatus.tsx`
- `apps/extension/src/ClipStatus.test.tsx`
- `README.md`
- `docs/core-concepts.md`

**Estimated scope:** Medium: 4 files.

## Task 15: Verify the complete capture flow

**Description:** Run the plan's final automated matrix and a real Firefox acceptance walk-through against the authorized, announced development target. Record evidence and gaps, including overlapping captures that cannot be certified by local fixtures alone.

**Acceptance criteria:**

- [x] Supported feed/detail layouts and text/link/image/gallery/video/crosspost cases save correct outer content; selected parent/reply comments, later additions, navigation/loading, source links, bounded search, signed-out/error feedback, and initial AI-limit behavior match the spec.
- [ ] Two independent authenticated clients/tabs save overlapping/disjoint comment selections for the same owner/post concurrently; one item contains the union without duplicates, lost updates, or extra AI runs. A second owner remains isolated and existing X clipping works.
- [x] Required automated checks pass and the verification report maps every spec criterion to actual evidence; any unverified criterion remains incomplete and is presented for review rather than described as passed.

**Verification:**

- [x] Run all commands in `plan.md` under “Verification checkpoints and commands,” plus formatter checks for changed implementation files.
- [x] Push/codegen only after classifying and authorizing the development target; load the Firefox MV3 bundle and exercise the manual matrix above. Record browser/version and test-case evidence without tokens or private content.
- [x] Check deletion of a captured discussion, independent owner capture, unchanged-repeat timestamps, additions without paid reruns, and the visible inspector after the concurrent-save case.

**Dependencies:** Tasks 6 and 14, plus all earlier checkpoint outcomes.

**Files likely touched:**

- `docs/verification/reddit-clipping.md`
- `SPEC-reddit-clipping.md` (final verified status and reviewed deviations)
- `tasks/todo.md` (actual completion state)

**Estimated scope:** Medium: 3 files; verification/evidence. Any discovered implementation defect becomes a focused repair task before this task completes.

### Checkpoint: Complete

The real-tweet X check is explicitly reserved for the user's manual verification;
see the report's remaining-check instructions. The mixed criteria below stay
unchecked until that evidence is supplied.

- [ ] Final automated checks pass and required live Firefox evidence is complete, including actual concurrent save results and X regression.
- [x] No secrets/private fixtures, generated-file hand edits, scope additions, or silently weakened criteria entered the change.
- [ ] Review the completed implementation and evidence with the user. Deployment to production, extension signing, and publishing remain outside this task list.

## Task 16: Clip each comment immediately

**Description:** Replace checkbox injection with a native Clip button on each
eligible comment. Connect each button to one immediate post-plus-single-comment
request, with state independent of other comment buttons. Remove selection/count
wiring from the watcher and keep its post button post-only. Include lifecycle and
retry coverage as part of this working feature slice.

**Acceptance criteria:**

- [x] Each readable loaded comment has exactly one accessible Clip button in its
      own action row. Clicking or keyboard-activating it sends exactly its own
      snapshot plus the containing post, with no selection/count UI or required post
      click; the post button always sends `comments: []`.
- [x] Pending and successful comment buttons suppress repeats for the current
      visit without blocking another comment or post. Failures remain retryable with
      the identical frozen request and useful signed-out/network/size feedback;
      `addedCommentCount: 0` is success.
- [x] State survives same-post DOM/action-row replacement and rendering gaps;
      recycled identities are validated, route changes reject stale completions,
      dynamically loaded eligible comments receive controls, and cleanup releases
      controls, handlers, observers, and feedback timers.

**Verification:**

- [x] `pnpm --filter @mindspool/extension exec vitest run src/redditCommentClips.test.ts src/injectRedditComments.test.ts src/injectRedditButton.test.ts src/redditComment.test.ts src/redditClip.test.ts`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] `pnpm --filter @mindspool/extension build:firefox`
- [x] Fixture checks cover exact parent/reply payloads, two simultaneously pending
      comments, independent post saves, ambiguous failure followed by changed DOM,
      signed-out/size failures, zero-addition success, replaced action rows, and
      navigation away/back before a response. Manual browser evidence follows in
      Task 18.

**Dependencies:** Existing Reddit extraction, transport, and atomic merge
implementation (Tasks 1–15); their unrelated pending manual X check does not
block this UI revision.

**Files likely touched:**

- `apps/extension/src/redditCommentClips.ts` (new)
- `apps/extension/src/redditCommentClips.test.ts` (new)
- `apps/extension/src/injectRedditComments.ts`
- `apps/extension/src/injectRedditComments.test.ts`
- `apps/extension/src/injectRedditButton.ts`

**Estimated scope:** Medium: 5 files.

## Task 17: Retire the obsolete selection flow

**Description:** Remove unused bulk-selection code and its obsolete tests once
Task 16 is connected. Extend the post-button regression tests to prove detail and
feed post clips remain independent of comment saves, then check the whole
extension and the existing backend capture behavior.

**Acceptance criteria:**

- [x] The obsolete `RedditSelection` module and tests are removed with no remaining
      runtime imports; extension controls contain no Keep comment checkboxes,
      selected counts, or deselect-to-retry instructions.
- [x] Post buttons work in feed/detail views, suppress their own repeated pending
      clicks, and retain existing failure/replacement/navigation behavior while
      always sending zero comments.
- [x] Extension tests/typechecking and both browser builds pass; existing backend
      capture tests still prove repeated IDs, atomic merges, unchanged snapshots,
      and no additional automatic labeling run.

**Verification:**

- [x] `pnpm --filter @mindspool/extension test`
- [x] `pnpm --filter @mindspool/extension typecheck`
- [x] `pnpm --filter @mindspool/extension build:firefox`
- [x] `pnpm --filter @mindspool/extension build`
- [x] `pnpm --filter @mindspool/backend exec vitest run convex/redditCapture.test.ts convex/items.test.ts`
- [x] Search extension source for obsolete selection imports and UI wording;
      check formatter output for changed source files. Browser confirmation follows
      in Task 18.

**Dependencies:** Task 16.

**Files likely touched:**

- `apps/extension/src/redditSelection.ts` (delete)
- `apps/extension/src/redditSelection.test.ts` (delete)
- `apps/extension/src/injectRedditButton.test.ts`

**Estimated scope:** Medium: 3 files.

### Checkpoint: Individual clipping implementation

- [x] Tasks 16–17 acceptance criteria and focused/full checks pass.
- [x] Review exact request payloads and lifecycle coverage; no backend or schema
      changes are required by the implemented flow.

## Task 18: Document and verify the revised interaction

**Description:** Update the current product specification to describe immediate
per-comment clipping and append dated browser evidence without rewriting earlier
checkbox test results. Verify visible behavior and saved Library content.

**Acceptance criteria:**

- [x] The spec describes immediate comment buttons, post-only post buttons,
      same-item additive persistence, independent save/retry state, and session-only
      success indication; checkbox/batch-selection instructions are superseded.
- [ ] Real browser evidence covers readable parent/reply buttons, newly loaded
      comments, keyboard activation, pending/retry feedback, node replacement, and
      navigation. Authenticated saves demonstrate comment-first item creation,
      another comment added to the same item, and duplicate-safe repeat clipping.
- [ ] The inspector shows the post and exactly the saved comments; earlier
      verification remains historical, any unavailable live check stays explicitly
      incomplete, and the existing manual real-tweet X check remains pending until
      separately verified.

**Verification:**

- [ ] Load the Firefox MV3 build in an available extension-capable browser and
      inspect both the clicked controls and resulting Library item. Use T3 preview
      tools first when available; record browser/extension setup and whether the
      transport was authenticated or mocked.
- [ ] Clip two distinct comments independently, including overlapping pending
      actions, then clip the post; confirm one item, both snapshots, unchanged first
      post snapshot, and no extra automatic labeling run.
- [ ] Retry after an offline or signed-out failure and navigate during a pending
      request; verify frozen payload behavior and absence of feedback on the new
      page's controls.
- [x] `pnpm exec prettier --check SPEC-reddit-clipping.md docs/verification/reddit-clipping.md tasks/plan.md tasks/todo.md`

**Dependencies:** Tasks 16–17 and their implementation checkpoint.

**Files likely touched:**

- `SPEC-reddit-clipping.md`
- `docs/verification/reddit-clipping.md`
- `tasks/plan.md` (revision status only)
- `tasks/todo.md` (actual completion state)

**Estimated scope:** Medium: 4 documentation files plus browser verification.

### Checkpoint: Individual clipping complete

- [ ] Every revision acceptance criterion has automated or live evidence as
      appropriate; gaps remain clearly identified rather than marked passed.
- [ ] Review the concrete implementation and evidence with the user. Existing
      pending X verification remains visible; production deployment and extension
      publishing are outside this revision.

Revision evidence (2026-10-09): Tasks 16–17 and automated implementation checks
pass. Task 18 documentation is updated; T3 live Reddit DOM checks used the actual
watcher with mocked transport. Revised authenticated Firefox saves, inspector
results, and keyboard acceptance remain open, alongside the separately reserved
real-tweet X check. See the dated revision in the verification report.
