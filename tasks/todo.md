# Tasks: Single-link tweets with hidden source context

Status: **Implementation, local checks and independent review complete. T13 live
browser acceptance and the deployment rehearsal remain open pending authorization
for the development target.**

Read [the plan](plan.md) and [the spec](../SPEC-tweet-links.md) before execution.
The user authorized moving the unfinished Visual Web Clipper checklist to
[its archive](archive/visual-web-clipper-todo.md); its open checks remain open.

Each task begins with meaningful failing regression tests and ends with its
focused verification. Documentation uses review/evidence rather than artificial
unit tests. File lists include tests and are capped at five; split a task before
adding more files. Generated declarations count toward that limit and can be a
separate mechanical follow-up. Production deployment and migration execution are
not authorized by completion of these implementation tasks.

## T1: Define the hidden tweet role contract

- [x] Complete T1.

**Description:** Add the additive storage contract and shared predicates without
activating hidden roles for new captures.

**Acceptance criteria:**

- [x] Optional `libraryRole` is `tweet_pending` or `tweet_source`; absence means
      normal. Add optional `tweetLinksVersion` and the label role projection.
- [x] Shared predicates distinguish normal/source/pending; validators accept
      legacy rows and reject invalid roles. Roles are not public capture inputs.
- [x] Add role-aware ordinary/label indexes and search filter fields alongside
      current indexes. Installed Convex types and focused tests accept missing-role
      equality without a normal-item initialization migration.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/itemVisibility.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** None.

**Files likely touched:** `packages/backend/convex/validators.ts`,
`packages/backend/convex/schema.ts`, `packages/backend/convex/itemVisibility.ts`,
`packages/backend/convex/itemVisibility.test.ts`.

**Estimated scope:** Medium, four files.

## T2: Make role transitions preserve item counts

- [x] Complete T2.

**Description:** Centralize normal-item contribution so hiding, promoting,
refreshing, recounting, and deleting a tweet preserve exact counters.

**Acceptance criteria:**

- [x] Normal → source/pending removes contributions once; pending → normal adds
      them once; repeated transitions do not change counts.
- [x] Hidden tweets have false inbox/review flags. Recount and state repair do
      not count or restore them; source snapshot fields and images remain intact.
- [x] Removing hidden versus normal items applies the correct deltas. Deleting
      one resource preserves the source used by another and updates linked stats.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/itemState.test.ts convex/itemState.invariant.test.ts convex/items.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T1.

**Files likely touched:** `packages/backend/convex/itemVisibility.ts`,
`packages/backend/convex/itemState.ts`, `packages/backend/convex/items.ts`,
`packages/backend/convex/itemState.invariant.test.ts`,
`packages/backend/convex/items.test.ts`.

**Estimated scope:** Medium, five files.

## T3: Exclude hidden tweets from ordinary library reads

- [x] Complete T3.

**Description:** Query normal roles at the index boundary while retaining
internal source access.

**Acceptance criteria:**

- [x] All ordinary list/search/filter combinations select absent role before
      pagination. Legacy normal items remain visible and correctly ordered.
- [x] Normal get/detail treat hidden rows as unavailable; the owner-scoped
      `fromPost` helper continues to resolve a hidden source with unchanged shape.
- [x] Mixed-role pages, more than one page of sources, search ranking, and
      foreign IDs produce no leaks or lost normal items.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/itemQueries.test.ts convex/items.test.ts convex/tweetLinks.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T1, T2.

**Files likely touched:** `packages/backend/convex/items.ts`,
`packages/backend/convex/itemVisibility.ts`,
`packages/backend/convex/itemQueries.test.ts`,
`packages/backend/convex/items.test.ts`.

**Estimated scope:** Medium, four files.

### Checkpoint A: Role and query foundations

- [x] T1–T3 pass; legacy rows remain normal, sources/pending rows have no normal
      count contribution, and source context is available only through owned reads.
- [x] Backend suite/typecheck pass. Review role/index and transition contracts
      before activating capture producers; record any requested changes in the plan.

## T4: Exclude hidden tweets from labels

- [x] Complete T4.

**Description:** Apply role-aware label reads and guard all manual label writers.

**Acceptance criteria:**

- [x] Label lists, searches, suggestions, and assignment choices exclude hidden
      items; role projections are written through shared link-state maintenance.
- [x] Attach/confirm/restore and shared membership helpers reject hidden items;
      a stale item ID cannot label a source or alter its inbox/review contribution.
- [x] Stale rows awaiting cleanup are suppressed by owned-item checks; cursors
      advance across sparse pages and later normal items remain reachable. Any
      actual label count projection excludes hidden items; do not invent a count API.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/itemLabels.test.ts convex/itemQueries.test.ts convex/itemState.invariant.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T1–T3.

**Files likely touched:** `packages/backend/convex/itemLabels.ts`,
`packages/backend/convex/libraryWriters.ts`,
`packages/backend/convex/itemState.ts`,
`packages/backend/convex/itemLabels.test.ts`,
`packages/backend/convex/itemQueries.test.ts`.

**Estimated scope:** Medium, five files.

## T5: Exclude hidden tweets from boards

- [x] Complete T5.

**Description:** Apply normal-item eligibility to trays, previews, placements,
and existing board elements.

**Acceptance criteria:**

- [x] All tray branches/sorts/searches exclude hidden roles, including label
      search and review/source filters. Cursors preserve normal-item reachability.
- [x] New placement and existing-element validation reject hidden items even if
      an old label membership remains; connections to invalid source cards disappear.
- [x] Existing cleanup removes invalid placements/edges in bounded work and bumps
      revisions. Resource cards, columns, and stored visual captures are unaffected.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/boardTray.test.ts convex/boards.test.ts convex/boardState.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T1–T4.

**Files likely touched:** `packages/backend/convex/boardTray.ts`,
`packages/backend/convex/boardState.ts`,
`packages/backend/convex/boardPreviews.ts`,
`packages/backend/convex/boardOperations.ts`,
`packages/backend/convex/boardTray.test.ts`.

**Estimated scope:** Medium, five files. If additional test edits are necessary,
create a focused follow-up before broadening this task.

## T6: Preserve MCP provenance without normal source-item access

- [x] Complete T6.

**Description:** Audit shared discovery and independent direct-read paths for
source visibility and ownership.

**Acceptance criteria:**

- [x] MCP discovery/search/label discovery and relation listings return normal
      items only; source metadata remains available as a resource's `fromPost`.
- [x] Legacy detail, efficient read, excerpt, and chunk paths cannot bypass the
      normal-item role check through a known hidden ID. Keep existing not-found
      behavior and response-size limits.
- [x] Multi-owner tests, sparse cursors, and existing resource source contexts
      pass without changing published MCP tool schemas.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/mcpDiscovery.test.ts convex/mcp/tools/excerpt.test.ts convex/mcp/tools/shape.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T1–T4.

**Files likely touched:** `packages/backend/convex/mcpDiscovery.ts`,
`packages/backend/convex/mcpDiscovery.test.ts`,
`packages/backend/convex/mcp/tools/read.ts`,
`packages/backend/convex/mcp/tools/excerpt.test.ts`.

**Estimated scope:** Medium, four files.

### Checkpoint B: Read surfaces and manual interactions

- [x] T4–T6 pass; Library, labels, boards, and MCP exclude fixture sources and
      pending tweets while resource context survives. No capture activation yet.
- [x] Backend suite and backend/web typechecks pass. Pagination and public
      behavior reviewed against the role contract.

## T7: Prevent source tweets from entering classification

- [x] Complete T7.

**Description:** Guard decision reservation, explicit classification, action
input, and provider dispatch for both hidden roles.

**Acceptance criteria:**

- [x] Automatic and explicit entry points refuse hidden tweets before budget
      reservation or run insertion; ordinary resources still classify normally.
- [x] A queued action whose tweet becomes hidden before input/dispatch exits
      without calling the provider or adding labels.
- [x] Guards preserve existing normal-item error and AI-limit semantics; tests
      observe provider calls and actual reservation deltas rather than only flags.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/decisions.test.ts convex/clef.test.ts convex/decisions.limit.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T1, T2.

**Files likely touched:** `packages/backend/convex/decisions.ts`,
`packages/backend/convex/clef.ts`,
`packages/backend/convex/decisions.test.ts`,
`packages/backend/convex/clef.test.ts`.

**Estimated scope:** Medium, four files.

## T8: Make delayed completion safe after conversion

- [x] Complete T8.

**Description:** Close enrichment, generic-run, and late-result paths that could
restore normal source behavior or settle an AI hold twice.

**Acceptance criteria:**

- [x] Enrichment completion/expiry/backfill cannot initiate classification on
      hidden rows. Generic processing run start/finish cannot bypass role checks.
- [x] Conversion or late decision completion releases unspent holds once and
      cannot apply labels; real historical/in-flight provider usage remains truthful.
- [x] Repeated completion/expiry and either race ordering preserve run settlement,
      counters, metadata snapshots, and normal resource enrichment/classification.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/enrichment.test.ts convex/processingRuns.test.ts convex/decisions.test.ts convex/decisions.limit.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T2, T7.

**Files likely touched:** `packages/backend/convex/enrichment.ts`,
`packages/backend/convex/processingRuns.ts`,
`packages/backend/convex/decisions.ts`,
`packages/backend/convex/processingRuns.test.ts`,
`packages/backend/convex/decisions.test.ts`.

**Estimated scope:** Medium, five files.

### Checkpoint C: Background jobs respect source status

- [x] T7–T8 pass; provider spies show zero classification calls for new hidden
      rows and all reservation/completion race cases preserve accounting.
- [x] Backend suite/typecheck pass. Distinguish already-performed historical AI
      work from new classification that this change prevents.

## T9: Convert a saved tweet through bounded cleanup

- [x] Complete T9.

**Description:** Implement the shared source conversion operation used by live
extraction and historical migration.

**Acceptance criteria:**

- [x] Conversion changes role/contribution once, immediately suppressing all
      normal reads and mutations without deleting snapshot content or references.
- [x] Cleanup paginates label/run history, invalidates board membership, and
      reuses bounded placement/edge cleanup; pending decision holds are safely
      released through the settlement contract from T8.
- [x] More-than-one-batch fixtures, duplicate continuations, missing rows, late
      jobs, and resource deletion preserve progress, references, and exact counters.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/tweetSourceState.test.ts convex/boardState.test.ts convex/itemState.invariant.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T2, T4, T5, T7, T8.

**Files likely touched:** `packages/backend/convex/tweetSourceState.ts`,
`packages/backend/convex/tweetSourceState.test.ts`,
`packages/backend/convex/itemVisibility.ts`,
`packages/backend/convex/processingRuns.ts`.

**Estimated scope:** Medium, four files.

## T10: Extract a single external resource with stable provenance

- [x] Complete T10.

**Description:** Lower the threshold and make extraction reuse the normal
resource pipeline and the hidden source conversion contract.

**Acceptance criteria:**

- [x] One eligible URL produces one new resource with `fromItemId`; several
      produce distinct resources under unchanged parsing/key/limit rules. Ignored
      X/Twitter/t.co URLs do not qualify. Extraction of an existing source is safe.
- [x] All-duplicate resources still convert the tweet. Fill a reused resource's
      missing source only; preserve existing attribution and update linked stats
      once. Concurrent extraction preserves one resource and one first source.
- [x] Version 2 completion and previous effective URL sets preserve deleted
      resources on retries/growing text. Reordered/new URLs cannot silently reuse
      a conflicting `xlink:` identity. Failure preserves retryable source content.

**Verification:** `pnpm --filter @mindspool/schema exec vitest run src/links.test.ts`;
`pnpm --filter @mindspool/backend exec vitest run convex/tweetLinks.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T9.

**Files likely touched:** `packages/schema/src/links.ts`,
`packages/schema/src/links.test.ts`,
`packages/backend/convex/tweetLinks.ts`,
`packages/backend/convex/tweetResourceWriters.ts`,
`packages/backend/convex/tweetLinks.test.ts`.

**Estimated scope:** Medium, five files. Keep registered endpoints in `tweetLinks`
and mutation helpers separate if needed to avoid capture/extraction import cycles.

## T11: Activate capture-time eligibility and pending recovery

- [x] Complete T11.

**Description:** Wire capture to the source/extraction pipeline before normal
processing, and resolve no-link clips after fuller-text eligibility is known.

**Acceptance criteria:**

- [x] Clips with known eligible links are saved as sources from the first commit,
      with resource creation and no source classification/normal count. Other
      text-bearing X clips are pending until the eligibility decision is made.
- [x] FxTwitter success/failure finalizes from the longest usable text; no-link
      tweets promote once to normal and start the existing pipeline. A bounded
      recovery handles action failure; late fetch/recovery races remain safe.
- [x] Repeated capture keys, caught extraction errors/partial writes, deleted
      rows, and concurrent tasks preserve snapshots and retries. Bare tweet URLs,
      Reddit, notes, and visual captures keep existing behavior.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/tweetCapture.test.ts convex/tweetLinks.test.ts convex/libraryWriters.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.

**Dependencies:** T3–T10.

**Files likely touched:** `packages/backend/convex/libraryWriters.ts`,
`packages/backend/convex/tweetLinks.ts`,
`packages/backend/convex/tweetResourceWriters.ts`,
`packages/backend/convex/tweetSourceState.ts`,
`packages/backend/convex/tweetCapture.test.ts`.

**Estimated scope:** Medium, five files.

### Checkpoint D: New capture works end to end

- [x] T9–T11 pass; zero/one/many/all-duplicate fixtures and scheduled execution
      show only normal resources and preserved source cards, with exact counts.
- [x] Backend/schema suites and backend/web typechecks pass. Review capture
      activation, pending recovery, and caught-error behavior before migration work.

## T12: Convert historical tweets with a repeat-safe migration

- [x] Complete T12.

**Description:** Add an internal versioned migration with preview, continuation,
and bounded source/reference repair, using existing saved tweet text.

**Acceptance criteria:**

- [x] Preview reports owner-scoped candidate outcomes without writes. Repair
      legacy URL keys and `xlink:` references before extraction; each batch has
      explicit row/byte bounds, cursor progress, and useful aggregate counts.
- [x] Previously processed single-link tweets create/reuse their skipped resource;
      previously processed multi-link tweets do not recreate absent/deleted
      resources. Never-processed tweets use the new rule; no-link tweets stay normal.
- [x] Repeated/interrupted runs, concurrent new capture/extraction, stale labels,
      board placements, missing sources, and a second owner preserve snapshot
      data, provenance, exact counters, and idempotent linked stats.

**Verification:** `pnpm --filter @mindspool/backend exec vitest run convex/tweetSourceMigration.test.ts convex/tweetLinks.test.ts convex/itemState.invariant.test.ts`;
`pnpm --filter @mindspool/backend typecheck`. No live migration during this task.

**Dependencies:** T3–T11.

**Files likely touched:** `packages/backend/convex/tweetSourceMigration.ts`,
`packages/backend/convex/tweetSourceMigration.test.ts`,
`packages/backend/convex/tweetLinks.ts`,
`packages/backend/convex/tweetResourceWriters.ts`.

**Estimated scope:** Medium, four files.

## T13: Verify the existing source-post inspector

- [ ] Complete T13.

**Description:** Prove resources retain their source presentation after the
source becomes hidden, without adding a new tweet viewer.

**Acceptance criteria:**

- [x] Each newly extracted resource renders the existing title/excerpt/post link
      from the hidden source; resources with no source keep existing presentation.
- [x] Foreign or missing source data is omitted safely. Source-only rows cannot
      be opened as ordinary library detail; original-post links still work.
- [ ] A real development-browser check records one-link capture, resource detail,
      source absence from Library/labels/search, and no source classification.
      If browser/auth prerequisites are unavailable, leave this criterion open.

**Verification:** `pnpm --filter @mindspool/web exec vitest run src/inspector/ItemInspector.test.tsx`;
`pnpm --filter @mindspool/web typecheck`; record browser evidence in the report.
Use T3 preview for web surfaces; extension capture requires an extension-capable
session and must not be inferred solely from unit tests.

**Dependencies:** T10, T11.

**Files likely touched:** `apps/web/src/inspector/ItemInspector.test.tsx`,
`apps/web/src/inspector/SourcePost.tsx` only if a demonstrated regression needs it,
`docs/verification/tweet-links.md`.

**Estimated scope:** Medium, up to three files.

## T14: Record integrated verification and migration instructions

- [x] Complete T14 (local verification and runbook; T13 live acceptance remains open).

**Description:** Complete regression evidence and write a reviewable runbook for
converting existing tweets after deployment approval.

**Acceptance criteria:**

- [x] `pnpm check` passes with no skipped tests, weakened checks, or suppressed
      errors. Existing extension/mobile tweet text expansion, Reddit, plain URL
      dedupe, visual capture, board, MCP, and AI-limit regressions remain covered.
- [x] Report maps the revised spec to evidence. Runbook names internal preview
      and apply functions with full executable commands matching the implemented
      validators, target classification, continuation/progress, and before/after
      counts. Include a development rehearsal and backup/recovery notes before
      any approved production conversion; do not promise reversibility of cleanup.
- [x] Update feature/task status only to the verified scope, record limitations,
      and complete code review. No live data migration, production deployment,
      dependency additions, or changes to archived unfinished work are implied.

**Verification:** `pnpm check`; `git diff --check`; review the implementation diff
against the spec and every task. Read installed Turbo docs before changing Turbo
configuration/commands. Do not execute runbook commands without target approval.

**Dependencies:** T12, T13.

**Files likely touched:** `docs/verification/tweet-links.md`,
`SPEC-tweet-links.md`, `README.md`, `tasks/plan.md`, `tasks/todo.md`.

**Estimated scope:** Medium, five documentation files. Production-code defects
become separately scoped tested follow-ups before rerunning the relevant gate.

### Checkpoint E: Outcome ready for review

- [ ] T12–T14 pass; new capture and historical conversion are proven, source
      snapshots survive, normal surfaces/counters agree, and source AI work is prevented.
- [ ] Human reviews the outcome and migration preview/runbook. Apply any live
      migration only in the separately authorized deployment step.
