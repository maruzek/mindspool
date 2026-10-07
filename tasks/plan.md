# Implementation Plan: ai-limit

Spec: [SPEC-ai-limit.md](../SPEC-ai-limit.md). Tasks: [todo.md](todo.md) (markdown, no external tracker).

## Overview

Two guards around the only place the app spends Workers AI neurons (`decisions.startDecision` -> `clef.run`): cap the item
content sent to the model at 500 characters, and enforce a per-owner daily neuron budget (default 9,000, UTC day) with
reserve-then-settle accounting. A live progress bar in the sidebar, above the user footer, shows usage.

## Dependency graph

```
pure rules (500-char cap, dedupe, neuron rates, estimate, day/reset, limit parsing)
   └── schema: aiUsage table + processingRuns.reservedNeurons
          └── aiUsage.ts: reserve / settle / release (internal)
                 ├── enforcement: startDecision (throw) + auto-label on save (failed run) + settle in complete + release on failure
                 └── aiUsage.today (public query) + one-off backfill
                        └── web: AiUsageMeter in AppSidebar (+ mock, tests)
                               └── docs, verification report, backfill on dev, manual checks
```

## Architecture decisions

- **Pure first.** All numbers (cap, rates, estimate, reset time, env parsing) live in `decisionProvider.ts` / a small pure
  module and are unit-tested before any Convex code uses them.
- **Reserve in the mutation that schedules the action.** `startDecision` runs in a mutation, so check-and-reserve is one
  transaction: concurrent saves serialize on the `aiUsage` row, which is what makes the burst guarantee hold.
- **Estimate uses the real inputs**, not worst case: `buildState(item)` length + serialized questions length, divided by 3
  (conservative tokens), times the model rate. State is <= 500 characters, so estimates are small and tight.
- **Settle in `decisions.complete`** (it already receives the run; `clef.run` passes `inputTokens`). **Release in
  `finishRun` when a decision run fails.** The run stores `reservedNeurons`, which makes both idempotent (a run with
  `reservedNeurons` unset has nothing to settle or release).
- **Two entry behaviors, one guard.** `classify` (user action) throws `ConvexError LIMIT_REACHED`. Auto-label on save
  must never block saving, so it uses a variant that inserts a `failed` run "Daily AI limit reached" instead of throwing.
- **No blocking of save, no queue.** A blocked item waits for a manual Classify after 00:00 UTC.
- **New runs only.** The 500-character cap and the budget apply to new runs; old runs are untouched.
- **UI reuses the installed Progress** (`packages/ui/src/components/progress.tsx`, Base UI), restyled by `className` at the
  call site (green `--success` indicator, square, 4px); no change to the shared component's defaults.
- **Stuck reservation** (action crashes before settle or fail): it sits in today's row until the day rolls over. Bounded
  by the daily row, so it can cost at most one estimate per crash; accepted, noted in docs.

## Task list (summary; details and Verify commands in todo.md)

### Phase 1: Pure rules

- [x] T1 Input cap: 500 characters total, duplicate-field skip (S)
- [x] T2 Neuron rates, estimate, UTC day and reset helpers, limit parsing (S)

### Checkpoint: pure rules

- [ ] Backend tests and typecheck green

### Phase 2: Backend accounting and enforcement

- [x] T3 `aiUsage` table, `reservedNeurons`, reserve/settle/release (M)
- [x] T4 Enforce in classify and auto-label; settle on complete, release on failure (M)
- [x] T5 `aiUsage.today` query and one-off backfill (S)

### Checkpoint: backend

- [ ] `pnpm check` green, `convex-reviewer` on `convex/`, review with the human before the web work

### Phase 3: Web

- [x] T6 `AiUsageMeter` in the sidebar above the footer (M)
- [x] T7 Limit message reaches the inspector toast and run card (S)

### Checkpoint: web

- [ ] `pnpm check` green; walk-through in the real app

### Phase 4: Close-out

- [x] T8 Docs, verification report, backfill on dev, manual checks (S)

## Risks and mitigations

| Risk                                        | Impact | Mitigation                                                                                                                  |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Estimate too low, burst overshoots          | Med    | Chars/3 is conservative (real is ~chars/4); compare against recorded real usage in a test; 10% margin below the real 10,000 |
| Auto-label throwing blocks `items.create`   | High   | T4 uses a non-throwing variant; test that a capture at the limit still saves                                                |
| Row contention on `aiUsage`                 | Low    | One owner, one row per day, tiny writes; Convex retries OCC                                                                 |
| Day-boundary bug (local vs UTC)             | Med    | Single `utcDay(ms)` helper, tested at month/year ends                                                                       |
| Settle/release double-applied               | Med    | Driven by `run.reservedNeurons` which is cleared when applied; idempotency test                                             |
| Schema change on a populated dev deployment | Low    | Table is new, field optional                                                                                                |
| ReUI Progress restyle leaks to other uses   | Low    | Classes passed at call site only                                                                                            |

## Open questions

- None blocking. Spec decisions are recorded in the spec's "Decisions made".
