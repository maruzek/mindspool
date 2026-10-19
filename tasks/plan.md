# Implementation Plan: Single-link tweets with hidden source context

Status: **T1–T12 implemented and locally verified; inspector/live-browser acceptance and final verification in progress.**

Spec: [SPEC-tweet-links.md](../SPEC-tweet-links.md).
Execution checklist: [todo.md](todo.md).
The user requested planning after specification and confirmed that existing saved
tweets are included. Planning uses the proposed first-source attribution rule;
multiple sources per resource are outside this revision.

The user authorized archiving the previous Visual Web Clipper documents here:
[archived plan](archive/visual-web-clipper-plan.md) and
[archived checklist](archive/visual-web-clipper-todo.md).
Its unfinished browser acceptance remains unfinished; it is not part of this plan.

## Outcome

Clipping a tweet with one or more eligible external URLs produces normal resource
items and retains the tweet as hidden source context. Source tweets do not appear
in normal lists, search, labels, boards, MCP discovery, or counters, and do not
start classification. Each new resource retains its existing “Found in post” card.
A bounded migration also converts existing qualifying tweets and extracts links
that the old two-link threshold skipped.

## Evidence and constraints

The current capture path in `libraryWriters.ts` counts and enriches a tweet before
scheduling extraction. `enrichment.ts` starts classification on completion.
`decisions.ts`, `clef.ts`, and `processingRuns.ts` provide additional run and
completion paths. Hiding a library card alone would leave these paths active.

`items.ts` owns shared normal-item list/search helpers used by MCP discovery;
`boardTray.ts` also constructs queries independently. Label queries paginate
`itemLabels`. Board eligibility is centralized in `boardState.validElement`.
`items.fromPost` reads a source directly with ownership checks, so it can keep
working after normal item reads exclude the source.

The installed Convex 1.46 search filter builder accepts the field's declared
type, including an optional field's `undefined`. Test both ordinary index and
full-text equality on an absent role field before relying on it. Use installed
Convex types/docs for implementation and retain explicit args/returns validators.
No new dependencies, Turbo configuration changes, frontend redesign, or public
capture API shape changes are planned.

## Architecture decisions

### 1. Keep the snapshot and its identity

Add optional `libraryRole: "tweet_pending" | "tweet_source"` to `items`.
Absence means a normal library item, preserving all legacy records without a
whole-library initialization migration. Do not write `false`, `null`, or a third
spelling of normal. Centralize role predicates in `itemVisibility.ts`.

- `tweet_source`: saved tweet with eligible external resources; hidden permanently.
- `tweet_pending`: an X clip awaiting its initial eligibility decision; hidden and
  classification deferred until local/full text is evaluated.
- Absent: ordinary item with existing library behavior.

Keep tweet IDs, capture keys, text, URL, metadata, images, and `fromItemId`
references. Do not move tweets to a new table or copy their full text into every
resource. New fields remain server controlled; capture clients cannot submit roles.
Keep `items.create` returning the saved capture ID even when it is hidden.
Normal `get`/`detail` reads treat hidden rows as unavailable; `fromPost` deliberately
reads the owned underlying row, keeping its current bounded response shape.

### 2. Make exclusion part of queries and state maintenance

Add role-aware secondary indexes for normal item list/filter combinations, with
`ownerId`, `libraryRole`, then the existing equality fields. Retain identity and
relation indexes (`by_owner_capture_key`, `by_owner_url_key`, `by_owner_from`).
Use new index names during the additive rollout to avoid changing indexes still
used by existing workers. Add `libraryRole` to `search_text.filterFields`.
Normal list/search queries constrain the role to `undefined` before pagination.

For label-backed queries, add an optional role projection to `itemLabels`, role
filters/indexes matching the current label/suggestion/source query variants, and
role-aware `search_link` filters. Existing rows without a role remain normal.
Conversion cleanup updates/removes label participation in bounded batches.
During cleanup, a final owned-item guard suppresses stale label rows immediately;
retain advancing cursors and accurate `isDone` rather than treating a sparse page
as the end. Prove clients can traverse a run of stale rows without losing later
normal items. Do not add an unbounded refill loop to produce a dense page.

Hidden roles contribute zero to total, inbox, and review counters. Centralize the
role transition with counter deltas; refresh, recount, deletion, and retries must
use the same contribution rule. Creating a source directly never increments
normal counters. Deleting a hidden source must not subtract a normal item.

### 3. Resolve tweet eligibility before normal processing

For new X clips with captured text, detect eligible links synchronously:

- If known links exist, insert as `tweet_source`, create resources through the
  shared extraction helper in the capture transaction, then schedule the existing
  fuller-text action to discover additional links.
- Otherwise insert as `tweet_pending`, schedule the fuller-text decision, and
  defer ordinary enrichment/classification. If the available/fetched text still
  has no eligible link, promote once to normal and start the existing pipeline.
- Bare pasted tweet URLs without clip content keep their existing behavior;
  this revision does not introduce tweet scraping for every pasted URL.

Separate reusable extraction/role helpers from registered actions as needed to
avoid a `libraryWriters` ↔ `tweetLinks` module cycle. Capture success persists a
snapshot even if best-effort extraction fails; never mark processing complete
before resource writes succeed. Keep the source/pending role on a failed attempt
and let the scheduled retry complete it. Convex writes caught inside a mutation
do not automatically roll back: dedupe and completion markers must also be safe
if partial writes survive a caught error.

Keep the FxTwitter timeout and captured-text fallback. Add a bounded delayed
recovery for pending captures so an action failure does not leave a no-link tweet
hidden indefinitely. Recovery finalizes using captured text, and subsequent fuller
text may still convert a promoted normal tweet to a source. All finalization paths
re-read current state and are idempotent; document and test ordering races.

### 4. Preserve dedupe and first-source attribution

Lower `MIN_TWEET_LINKS` to one. Keep URL parsing, ignored hosts, URL keys, limits,
tracking removal, and appearance order unchanged. For a resource not yet saved,
use `insertCapture` with `fromItemId` and the existing `xlink:` capture identity.

For a reused owned resource, attach the source only if no `fromItemId` is stored.
Preserve any existing source, including a dangling reference; do not silently
rewrite provenance. Increment `linkedItemStats` only when assigning a new source.
Concurrent extractions must serialize the missing-source check and the write.
A tweet qualifies as hidden even when every resource already exists.

A missing/deleted resource previously extracted from the same tweet must stay
deleted. Distinguish initial discovery from replay with a versioned extraction
marker (`tweetLinksVersion`, current version 2), alongside the legacy
`linksExtracted`. Snapshot the previous effective link set before fuller-text
updates and create only newly discovered URLs on later extraction.

### 5. Guard every classification boundary

Check role before reserving AI budget, before scheduling/running a decision,
before returning provider input, and before applying any labels/results.
`processingRuns.start/finish` must not provide a bypass to the specialized flow.
Manual attach/confirm/restore and board placement reject hidden items using the
existing invalid/unavailable error style. Enrichment completion may preserve
useful captured metadata but cannot start classification for hidden rows.

On conversion, stop pending decision work and release unspent holds exactly once
using the existing run status/settlement rules. Late completion cannot attach
labels or settle the same hold twice. Keep historical paid usage truthful: do not
refund provider work already performed or erase historical usage measurements.
A provider call already in flight when an old normal tweet is converted cannot be
un-sent; record actual usage separately from preventing new calls and applying
labels. New qualifying clips never enter classification in the first place.

### 6. Convert existing tweets without losing deletion history

Add an internal, versioned, owner-scoped migration entry point in
`tweetSourceMigration.ts`. Support cursor-based continuation, a read-only preview,
and bounded progress counts. No global scan inside a user capture.

Process URL identity/source-reference repairs before extracting legacy resources.
Preserve the current `xlink:<tweetId>:<n>` source repair and linked counts. Then:

- Old `linksExtracted: true` with two or more eligible URLs: consider the old
  effective URL set already processed. Convert and repair provenance for surviving
  resources, but do not recreate absent resources.
- Old `linksExtracted: true` with exactly one URL: the old rule skipped it; create
  or reuse that resource, then convert and mark version 2.
- Never processed: use the new one-link extraction once, then mark version 2.
- No eligible URL: keep normal behavior and existing content. Do not hide every X
  item or fetch every historical tweet from an external service.

For this migration, use saved text; new captures and later explicit runs retain
fuller-text fetching. Repeated runs and captures racing migration must preserve
one resource per URL and exact counters. Persist the eligibility decision/version
before cleanup continuation, and make each cleanup step repeat-safe.

Source conversion immediately changes its role/counter contribution, then removes
normal label participation and stale board placements through bounded cleanup.
Reuse board invalidation/cleanup and preserve board revision changes and connected
edge cleanup. Keep source images and text; retain hidden snapshots after their
last resource is deleted. This is not a dedupe-deletion or orphan-GC migration.

### 7. Reuse the existing inspector and MCP contracts

The existing inspector “Found in post” card remains; add regression coverage
instead of a new full-tweet viewer. MCP normal item discovery/search and direct
normal item reads exclude hidden rows, but resource context retains its existing
`fromPost`. Audit both legacy and efficient MCP read paths, excerpt/chunk reads,
and relation listings; they do not all call the same item helper.

## Dependency graph and execution order

```text
T1 role contract
 └─ T2 lifecycle/counters ─ T3 normal list/search
                           ├─ T4 label surfaces
                           ├─ T5 boards
                           └─ T6 MCP
T2 ─ T7 decision dispatch ─ T8 completion safety
T4,T5,T7,T8 ─ T9 conversion cleanup
T9 ─ T10 extraction/provenance ─ T11 capture finalization
T3–T11 ─ T12 historical migration
T10,T11 ─ T13 inspector regression
T12,T13 ─ T14 integrated verification/runbook
```

Default execution is sequential T1–T14 in [todo.md](todo.md). Keep producer
activation at T11 after readers and guards are ready; migration runs only after
all verification. Tasks before activation can test hidden roles through fixtures
without changing live capture behavior. No intermediate revision is a rollout
candidate. Any separate checkout starts from a commit containing these documents.

After shared role predicates exist, label, board, and MCP changes have some
independent work, but they share validators/indexes. There is no automatic agent
delegation planned. Schema changes, role transitions, capture activation, and
migration remain sequential. Each task has at most five likely files; split any
additional fix into a named follow-up rather than expanding scope silently.

## Task index and checkpoints

1. T1 — Define the source/pending role contract.
2. T2 — Make role transitions preserve counters and deletion behavior.
3. T3 — Exclude hidden roles from ordinary library reads.
   Checkpoint A: legacy behavior and role-aware query/state invariants pass.
4. T4 — Exclude hidden tweets from labels.
5. T5 — Exclude hidden tweets from boards.
6. T6 — Preserve MCP source context while excluding normal item access.
   Checkpoint B: all user-facing read/interaction surfaces respect roles.
7. T7 — Prevent hidden tweets from entering classification.
8. T8 — Ignore late labeling side effects and settle holds safely.
   Checkpoint C: source/pending tweets cannot be classified through any entry path.
9. T9 — Convert an existing tweet through bounded cleanup.
10. T10 — Extract one-link resources with stable provenance.
11. T11 — Activate capture-time eligibility and pending recovery.
    Checkpoint D: new capture works end to end without a visible/labeled source.
12. T12 — Implement historical conversion with preview and resumability.
13. T13 — Verify the existing source-post inspector.
14. T14 — Run integrated regressions and document migration execution.
    Checkpoint E: plan criteria and full checks pass; outcome ready for review.

Detailed acceptance, commands, file limits, and checkpoint checklists live only
in [todo.md](todo.md).

## Verification strategy

Use Vitest and `convex-test` for real mutations, scheduled actions, role changes,
query cursors, counter invariants, and AI-hold settlement. Include multi-owner,
repeated-run, missing-source, all-duplicates, concurrent extraction, stale labels,
board edge cleanup, and deletion-history cases. Use web Testing Library for the
existing inspector. Record browser verification on an authorized development
backend, including extension capture and a second capture client when available.
Do not count a mocked backend test as proof of live browser behavior.

Focused commands appear in each task. The final repository gate is `pnpm check`.
Read installed Turbo documentation before modifying Turbo commands/configuration;
none is expected. Do not run `convex dev`, deploy, codegen with remote side effects,
or migration commands during planning. At implementation time classify any target
before a deployment-affecting command and obey the project's Convex deployment
guard. A production migration needs a reviewed preview, target-specific approval,
recovery information, and before/after evidence.

## Risks and mitigations

- **Missing optional-field equality support:** prove absent-role index/search
  behavior in T1/T3. If runtime behavior differs from installed types, revise the
  design before producer activation; do not silently hide all legacy items.
- **Source labeling during asynchronous work:** defer classification for pending
  clips and guard dispatch, generic workers, and completion independently.
- **Stale label rows and sparse pages during cleanup:** indexed projections plus
  final owned-item guards; test cursor progress across more than one cleanup batch.
- **Counter drift or double release:** central transitions and settlement helpers,
  repeat/concurrency tests, and recount checks before/after migration.
- **Recreating deliberately deleted resources:** preserve the old two-link
  interpretation when upgrading `linksExtracted`; use version 2 markers thereafter.
- **Capture-key reuse after text expansion:** keep appearance-order keys, test
  insertions/reordering, and treat a key already bound to another URL as a conflict
  to resolve in the extraction helper rather than overwrite or skip a new URL.
- **Broad changes disturb visual captures or Reddit clips:** activate only for X
  clips with content and run the existing full regression suites.
- **Historical charges cannot be undone:** prevent new source classification,
  release unspent reservations, and report already-performed work accurately.

## Review decisions and scope boundaries

Plan approval accepts the proposed role/index additions, pending-capture behavior,
first-source attribution, versioned migration, and historical cleanup semantics.
Existing tweets are explicitly in scope per user confirmation. No new dependency
or product decision is needed to prepare this plan.

The technical plan and checklist require human review before implementation,
following the invoked specification/planning workflow. Production execution is
separate; no production data was read or changed while planning. Keep the archived
Visual Web Clipper's incomplete acceptance separate from this feature's completion.
