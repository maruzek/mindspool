# Hidden tweet sources: verification and migration

Implementation branch: `feature/hidden-tweet-sources`. Version: 2.
Local gate completed 2026-10-20; source implementation and review fixes committed.
Development deployment completed 2026-10-20 with explicit user approval.
Live development browser/capture acceptance passed 2026-10-20. All T1–T14
implementation tasks are complete. No live historical migration was executed;
snapshot-seeded rehearsal remains a prerequisite for production conversion.

## Evidence

- Role contract: `itemVisibility.test.ts` proves absent-role equality for indexed
  pagination and full-text search, with legacy rows and owner isolation.
- Counters and reads: `itemState.invariant.test.ts`, `itemQueries.test.ts`,
  `items.test.ts` cover promotion, hiding, recount, deletion, every list/search
  filter, sparse stale-label cursors, and hidden direct reads.
- Labels/boards/MCP: label writer guards, tray eligibility, placed-card validity,
  incident-edge cleanup, efficient and legacy MCP reads, and retained `fromPost`.
- AI: `decisions.test.ts`, `clef.test.ts`, `processingRuns.test.ts`, AI-limit and
  enrichment suites cover reservation refusal, queued provider suppression,
  unused hold release, repeated late completion and actual paid usage.
- Extraction/capture: `tweetLinks.test.ts`, `tweetCapture.test.ts` cover one/many
  links, ignored hosts, duplicates, first-source attribution including dangling
  references, reordered growing text, deletion history, partial writes, longest
  text selection, fetching failure, pending recovery and late-fetch conversion.
- Historical conversion: `tweetSourceMigration.test.ts` compares all stored rows,
  counters and scheduled jobs before/after preview, repairs old `xlink:` source
  references, converts processed singles, preserves deleted multi-link resources,
  isolates owners and repeats safely.
- Inspector: `ItemInspector.test.tsx` verifies title/excerpt and the external
  original-post link while hidden normal detail remains unavailable. The card
  retains its existing appearance.

Checkpoint D passed 642 backend tests. T12 focused checks passed 47 tests.
Final repository gate results are recorded below.
No test timeout or assertion was weakened. Limiting `VITEST_MAX_WORKERS=1` avoids
contention on this shared host. The public-schema audit now loads its module
inventory in a dedicated test worker, away from scheduled capture fixtures.

## Development deployment and browser acceptance

On 2026-10-19 the T3 collaborative browser opened this worktree at
`http://127.0.0.1:5199/library`. It rendered **“Sign-in is not configured”**.
At that point the worktree had example environment files only. That initial
prerequisite failure was resolved by the subsequent deployment and user sign-in.

On 2026-10-20 the user authorized deployment to `dev:graceful-stork-346`.
`convex dev --once --env-file` using the original checkout's backend configuration
completed successfully against that exact development target. Convex typechecking
passed, the role indexes/search filters and receipt index were installed, and
functions became ready. Code generation added only the two helper modules to
`_generated/api.d.ts`.

A bounded read-only inline query on that deployment selected an existing owner's
legacy rows using `libraryRole === undefined`: the ordinary index returned 20
normal rows and the search index returned four normal rows. No owner identifiers
or saved content were emitted. This verifies the deployed indexes accept absent
role equality; it does not certify a new extension capture.

The user signed into a new account in T3's default browser profile at
`http://127.0.0.1:5199/library`. The empty Library loaded without console errors.
Public development settings were also used to build Chrome and Firefox development
extensions successfully; no secret was placed in either frontend build.

The user then reported a successful real extension clip of
[this one-link post](https://x.com/leodev/status/2112514949167907029), providing a
Library/inspector screenshot from their existing account. The screenshot shows the
extracted resource, its enriched title/image, labels and existing “Found in post”
title/excerpt. Scoped deployment queries verified:

- Snapshot `j970qynbt5mn8rkbfe4njd8gas8gmfm2` has `captureSource: extension`,
  `libraryRole: tweet_source`, version 2, false inbox/review flags, zero label
  memberships and **zero processing runs**.
- Its single normal resource `j978m4mw51kkx3m2bccyj5aemx8gndwb` is
  `https://gradients.sh`, titled “gradients.sh: animated gradient backgrounds for
  React”. Resource enrichment and decision runs both succeeded; it has four labels.
- Normal Library and MCP discovery return the resource and exclude the source.
  Searching for `leodev` returns no source; ordinary source detail returns null.
  MCP resource detail retains the original post URL, author/title and excerpt.
- The owner's complete stored set has 84 normal items; its counters match the
  normal rows exactly: total 84, inbox 55, needs review 37. The source contributes
  zero. Historical normal tweets are unchanged until a separately approved migration.

Independent API-driven fixtures in the new account supplemented the real clip:

- One-link fixture snapshot `j976bne14fd00ktwcp633m91nd8gn7c4` created only the
  Example Domain resource. T3 showed one Library item, an empty search for the
  source-only marker `zephyrquartzv2`, the resource-only label list and board tray,
  and “Not found” when opening normal detail with the hidden source ID.
- Resource detail rendered the source title/excerpt. Its source anchor used the
  original X URL with `_blank` and `noopener noreferrer`; browser console had no
  errors. Source labeling and explicit classification both rejected with
  `NOT_FOUND`; source run count stayed zero. MCP discovery/search and direct-reader
  checks also excluded the source.
- A no-link fixture with an unavailable fuller-text page promoted to normal and
  ran the ordinary pipeline once: one enrichment run (failed for the fixture URL)
  and one successful decision run.
- Deleting the Example Domain resource and replaying extraction preserved the
  source snapshot without recreating the resource. Expanding text with an IANA URL
  created only that new resource. All synthetic capture items were then removed;
  the user's real clip remains intact. The empty verification label/board remains
  available in the new test account. A final deployment read confirms zero test
  items, zero total/inbox/review counts and zero reserved neurons in that account;
  the real resource and hidden source still exist.

The API fixtures are not evidence of a second real capture client. No second
capture client was available. Concurrency and broader deletion/retry/growing-text
coverage remain backed by the automated suites described above.

Historical migration execution remains separate. Before production conversion,
rehearse the migration below on a snapshot-seeded development deployment and
record counts, cleanup completion, cursor recovery and repeated-run results.

## Migration contract

The only new migration entry point is the **internal** mutation
`tweetSourceMigration:batch`. It requires `ownerId`, `version: 2`, and `preview`.
Optional `phase` is `keys` or `tweets`; optional `cursor` is a string or null.
It returns `phase`, `cursor`, `isDone`, and per-call `scanned`, `eligible`,
`converted`, `created`, `repaired` counts, plus `version: 2`.

Start in `keys` with a null cursor. Pass the returned phase and cursor to the
next call until `isDone` is true. The key phase finishes the owner's identity and
source-reference repairs before extraction begins. Preview follows exactly the
same phase progression but never writes or schedules cleanup. Its `converted`
count is prospective; `created` is zero because no resource is written. It does
not predict a future provider's enrichment/classification results.

Key pages read at most 20 item rows; tweet pages read one row because extraction
may resolve up to 20 large resources. Both pages have a 1 MiB read bound. No
historical post is fetched. New pending clips use their own recovery lifecycle.
Conversion updates role and normal counter contribution immediately; label/run
cleanup and board cleanup continue through separate bounded scheduled mutations.
A source snapshot remains even after its last resource is removed. The additive
`tweetLinkReceipts` table records owner/source/URL identities per successful
resource operation. These small indexed receipts preserve deletion history
across caught partial writes and later texts that omit/reintroduce a URL. Legacy
completion markers seed receipts before accepting a text expansion.

## Target selection, approval and backup

These commands are instructions, not evidence of execution. Use the installed
Convex 1.46 CLI (`pnpm exec convex` in `packages/backend`). Its explicit target
option is `--deployment`, verified against local CLI help.

Before any deployment-affecting command, read the selected deployment settings,
classify the exact target as dev/preview/prod and announce it. Do not infer the
target from a shell's current directory. This implementation does not authorize
pushing code, setting credentials, running migrations, or restoring data on a
live target. Production requires a reviewed preview, fresh approval for the exact
target/action, a backup and a successful development rehearsal first.

On the approved target, export a dated snapshot including file storage before
conversion. Keep it outside the repository and check the command succeeds:

```sh
cd packages/backend
pnpm exec convex export --deployment APPROVED_DEPLOYMENT \
  --include-file-storage --path /secure/backups/mindspool-before-tweet-v2.zip
```

Restore that snapshot into a throwaway development deployment and prove its item,
label, board and storage data matches before applying the migration there. Review
that target's import/replace settings and authorize the restore separately.
Cleanup deletes source label membership and stale board placements/edges, so
rolling back code does not restore them. Recovery requires the snapshot plus
reconciliation of writes made after it; it is not an automatic undo.

## Executable preview and apply examples

Replace both placeholders with the approved target and the owner's exact stored
`ownerId` (the authentication token identifier, not a display name or email):

```sh
cd packages/backend
pnpm exec convex run --deployment APPROVED_DEPLOYMENT tweetSourceMigration:batch \
  '{"ownerId":"OWNER_TOKEN_IDENTIFIER","version":2,"preview":true,"phase":"keys","cursor":null}'
```

Continue preview using each returned phase/cursor. After review and target
approval, start a fresh apply traversal:

```sh
pnpm exec convex run --deployment APPROVED_DEPLOYMENT tweetSourceMigration:batch \
  '{"ownerId":"OWNER_TOKEN_IDENTIFIER","version":2,"preview":false,"phase":"keys","cursor":null}'
```

The following resumable driver runs from the repository root. Set
`TWEET_MIGRATION_TARGET`, `TWEET_MIGRATION_OWNER`, and
`TWEET_MIGRATION_PREVIEW` (`1` for preview, `0` for approved apply) first. Run
preview through completion, review its totals, and get apply approval before
changing the flag. It records every response and checkpoints the next cursor.
Run one driver per owner/target/mode. A lost response can be replayed safely;
aggregate log counts may include that replay, so final stored counters are the
source of truth.

```python
import json
import os
import subprocess
from pathlib import Path

target = os.environ["TWEET_MIGRATION_TARGET"]
owner = os.environ["TWEET_MIGRATION_OWNER"]
mode = os.environ["TWEET_MIGRATION_PREVIEW"]
assert mode in {"0", "1"}
preview = mode == "1"
checkpoint = Path(f"tweet-migration-v2-{mode}.json")
identity = {"target": target, "ownerId": owner, "preview": preview}
state = json.loads(checkpoint.read_text()) if checkpoint.exists() else {
    **identity, "phase": "keys", "cursor": None, "isDone": False,
    "totals": {k: 0 for k in ["scanned", "eligible", "converted", "created", "repaired"]},
}
assert all(state[k] == value for k, value in identity.items())
while not state["isDone"]:
    args = {"ownerId": owner, "version": 2, "preview": preview,
            "phase": state["phase"], "cursor": state["cursor"]}
    output = subprocess.run(
        ["pnpm", "exec", "convex", "run", "--deployment", target,
         "tweetSourceMigration:batch", json.dumps(args)],
        cwd="packages/backend", capture_output=True, text=True, check=True,
    )
    result = json.loads(output.stdout)
    print(json.dumps({"request": args, "result": result}), flush=True)
    for key in state["totals"]:
        state["totals"][key] += result[key]
    state.update({key: result[key] for key in ["phase", "cursor", "isDone"]})
    temp = checkpoint.with_suffix(".tmp")
    temp.write_text(json.dumps(state, indent=2))
    temp.replace(checkpoint)
print(json.dumps(state["totals"], indent=2))
```

For an interrupted run, rerun with the same target/owner/mode and checkpoint.
Keep completed preview and apply checkpoints as evidence; use a new checkpoint
filename for the deliberate second full pass that proves repeat safety.

## Before/after evidence and cleanup

Capture the owner's `ownerStats` row from the dashboard (or a scoped read-only
inline query) before and after. Record the preview totals and each apply response.
Normal total should change by `created - converted`; hidden sources contribute
zero. Inbox/review depend on resource processing, so compare them to the bounded
recount after scheduled work settles rather than assuming a fixed delta.

After approving any recount, its exact invocation is:

```sh
pnpm exec convex run --deployment APPROVED_DEPLOYMENT itemState:recountOwnerStats \
  '{"ownerId":"OWNER_TOKEN_IDENTIFIER"}'
```

That function can schedule continuations; wait for completion in the target's
scheduler/logs. Verify pending source decision holds are released, source labels
and invalid board cards/edges drain, board revisions advance, and historical paid
usage remains recorded. A provider already in flight may report paid usage later;
its result must not apply labels. Check linked-item counts through existing
resource-count maintenance for legacy rows whose count was previously absent.

Repeat preview and apply from `keys`/null on the rehearsal target. It should
report no further conversions or creations, keep exact normal counters, and
preserve resource IDs, source references and stored snapshots. Only then prepare
the production preview/recovery evidence and request the separate approval.

## Implementation decisions

- Added an ordinary-role relation index so hidden children cannot consume the
  MCP relation limit before normal children are selected.
- `hasItems` is a bounded hint: 20 projected memberships are checked against
  owned normal items. It is conservative until stale source rows drain.
- Conversion schedules board and label/run cleanup independently because Convex
  permits one paginated query per mutation, including a migration caller.
- The shared extraction helper receives the resource writer as an argument to
  avoid a runtime capture/action import cycle.
- Migration processes one tweet per extraction transaction to bound reads of up
  to 20 full resources; this trades more continuation calls for predictable work.
- URL receipts add one indexed table to preserve deletion history without an
  ever-growing source document. State repair and deletion use the same counter
  and hold contribution rules as role conversion.
- Recovery uses captured text after 30 seconds; a later longer fetch can convert
  the promoted item. Repeated finalization re-reads state and starts the ordinary
  pipeline once.
- The source card opens the original post because source-only snapshots cannot
  be opened through normal detail. No full-tweet viewer was added.

## Final gate and review

A fresh-context review by GPT-6-Astra found a deletion-history defect: an item
written before a caught extraction error could be deleted and then recreated on
retry; omitted/reintroduced URLs also lost history. Both cases now have durable
receipts and regressions that failed first, then passed. A stale-hidden-flag
repair regression also failed first and now passes with role-aware contribution
deltas. No review finding remains deferred.

MCP read fixtures now hold dormant capture jobs with fake timers and clear them
on teardown. This prevents background jobs from crossing convex-test databases;
real scheduled behavior is exercised in capture tests. The original five-second
timeout and all MCP assertions remain in place. Focused fix verification passed
112 tests and backend typecheck. The final `VITEST_MAX_WORKERS=1 pnpm check` passed formatting, all package
tests, six workspace typechecks and three builds (including Android export).
Its backend stage passed 646 tests; after the final deletion-race change the
complete backend suite was rerun and passed 647 tests across 52 files. The other
suites passed 49 schema, 329 web, 171 extension and 119 mobile tests. This gives
1,315 passing tests for the final code across the package suites. A final deletion-race regression also
found that removing a source before scheduled cleanup could retain its decision
hold. Bounded history deletion now releases that remaining reservation in the
same transaction; the regression and 53 related checks pass.

Fresh `git diff --check` and final documentation formatting checks also pass.

The subsequent live development checks above complete browser/extension capture
acceptance. The review and live capture checks do not replace the snapshot-seeded
rehearsal required before production historical conversion.
