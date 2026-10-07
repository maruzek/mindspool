# ai-limit verification

Date: 2026-10-07. Branch: `main` (uncommitted at the time of writing).
Spec: [SPEC-ai-limit.md](../../SPEC-ai-limit.md). Plan: `tasks/plan.md`.

## Automated

| Check                 | Result                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `pnpm test` (backend) | 18 files, 210 tests pass                                                          |
| `pnpm test` (web)     | 25 files, 268 tests pass                                                          |
| `pnpm typecheck`      | passes                                                                            |
| `pnpm build`          | passes                                                                            |
| `pnpm format:check`   | Fails only on `.mcp.json` (pre-existing, untouched); everything else is formatted |

## Success criteria

| #   | Criterion                                          | Evidence                                                                                                                                             |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bar shows usage in the sidebar, above the footer   | `AiUsageMeter.test.tsx`, `MobileShell.test.tsx`; **manual check open** (look in the real app)                                                        |
| 2   | Finished run adds its real neurons                 | `decisions.limit.test.ts` "settles to the real neurons" (650 tokens gives 5.32); live update is manual                                               |
| 3   | At the limit: saved, failed run, Classify refuses  | `decisions.limit.test.ts` (save at limit, classify throws `LIMIT_REACHED`); toast text in `ClassifyControl.test.tsx`; run text in `RunCard.test.tsx` |
| 4   | Burst never exceeds the limit                      | `decisions.limit.test.ts` 50 saves: `neurons + reserved <= limit` (reserve is checked in one transaction, so it is stricter than "limit + one run")  |
| 5   | Today's four runs backfilled once                  | Logic and idempotence tested in `aiUsage.test.ts`. **Open: not yet run on the dev deployment** (see below)                                           |
| 6   | At most 500 characters of content sent             | `decisionProvider.test.ts` (100,000-character fields, total at most 500)                                                                             |
| 7   | Count restarts after 00:00 UTC; `resetsAt` correct | `aiUsage.test.ts` (new day, fresh row), `aiBudget.test.ts` (month and year ends)                                                                     |
| 8   | `pnpm check` passes, no new dependency             | All steps pass except the pre-existing `.mcp.json` format failure; no dependency added                                                               |

## Deviations from the spec

- **Estimate has a fixed overhead.** The spec formula is `(state + questions JSON length) / 3` tokens. The two recorded live
  runs cost about 650 input tokens for a short item with 5 labels, so a bare chars/3 estimate would be about 150 tokens and
  undershoot. `REQUEST_OVERHEAD_TOKENS = 600` is added; the test checks it against the 652 and 642 token runs. Only two
  of the four recorded runs have token counts in the docs; the other two were not available.
- **`aiUsage.backfilled`**: optional boolean on the table, needed for the idempotent backfill (the spec named the guard
  but not the field).
- **No-op runs are free.** A run with no labels or no usable text never calls the model, so it reserves nothing and is
  never blocked.

## Known limits

- **Stuck reservation:** if the action crashes before it settles or fails the run, its estimate stays in that day's row until
  the day rolls over (at most one estimate per crash).
- Runs started before the budget existed carry no reservation and are not settled; they are only counted by the backfill.

## Open manual checks

- Backfill today's runs on the dev deployment (state the deployment first, then):
  `npx convex run aiUsage:backfillToday '{"ownerId":"<your tokenIdentifier>"}'`, then `npx convex data aiUsage`.
- In the real app with `AI_DAILY_NEURON_LIMIT=20`: save items and watch the bar fill, confirm a later save is unlabeled with
  a failed run, and Classify toasts the limit. Restore the default afterwards.
- Look at the bar in the real sidebar (green, amber from 80%, red at 100%) on desktop and in the mobile sheet.
