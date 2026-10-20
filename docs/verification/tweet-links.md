# Hidden tweet sources: verification and migration

Implementation branch: `feature/hidden-tweet-sources`. Version: 2.
No live deployment or migration was executed. Browser capture acceptance and a
snapshot-seeded development rehearsal remain open.

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
Final repository gate results are recorded below when complete.
No test timeout or assertion was weakened. Limiting `VITEST_MAX_WORKERS=1` avoids
contention on this shared host. The public-schema audit now loads its module
inventory in a dedicated test worker, away from scheduled capture fixtures.

## Browser acceptance still required

On 2026-10-19 the T3 collaborative browser opened this worktree at
`http://127.0.0.1:5199/library`. It rendered **“Sign-in is not configured”**.
The worktree has example environment files only. No authorized development
backend or extension-capable authenticated session was available in this worktree.
The original checkout has test-mode Clerk configuration and development target
`dev:graceful-stork-346`; using it for this revision requires the separately
authorized development deployment. This proves
only the local app shell starts; it does not prove capture behavior in a browser.

After configuring and authorizing a development backend, record:

1. Clip a one-link X post in the extension; repeat with a second capture client
   when available. Save the returned snapshot ID and resource ID.
2. Verify only the resource appears in Library, search, labels, boards and MCP;
   open resource detail and its original-post link.
3. Verify the source has no classification run/hold/provider call; only the
   resource enters enrichment and classification. Compare sidebar counts.
4. Exercise a no-link clip and a failed fuller-text fetch; it becomes a normal
   item once. Delete a resource, retry, then expand text; it stays deleted.
5. Rehearse the migration below on a snapshot-seeded development deployment and
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
112 tests and backend typecheck. The final `pnpm check` rerun is pending. A final deletion-race regression also
found that removing a source before scheduled cleanup could retain its decision
hold. Bounded history deletion now releases that remaining reservation in the
same transaction; the regression and 53 related checks pass.

The review did not certify live browser/extension capture, real deployment search
behavior, or a snapshot-seeded rehearsal. Those remain open prerequisites.
