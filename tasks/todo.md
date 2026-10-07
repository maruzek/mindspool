# Tasks: ai-limit

Plan: [plan.md](plan.md). Spec: [SPEC-ai-limit.md](../SPEC-ai-limit.md). One task per turn; stop at checkpoints. Focused
tests: `pnpm --filter @mindspool/backend test`, `pnpm --filter @mindspool/web test`. Typecheck: `pnpm typecheck`. Build:
`pnpm build`. Full: `pnpm check`. The schema changes named in the spec (new `aiUsage` table, optional
`processingRuns.reservedNeurons`) are approved once the plan is; anything else (new dependency, extra schema or index)
needs a question first. Regenerate `convex/_generated` when function signatures change.

**Per task:** load the listed `Skills` first (TDD: failing test, then code). Always finish with
`verification-before-completion` (run the Verify commands, report real output). `pnpm check` currently fails
`format:check` only on `.mcp.json` (pre-existing); report it as such.

## Phase 1: Pure rules

- [x] **T1: Input cap, 500 characters** (S)
  - In `convex/decisionProvider.ts` replace `STATE_CHAR_BUDGET = 60000` with `AI_INPUT_CHAR_LIMIT = 500`: a total for the
    content fields of `state`, filled in the existing priority order (title, description, author, site, url, text).
    A field whose trimmed text is already contained in an earlier field's text is skipped (case-sensitive). `truncated`
    stays true when anything was cut. Update the "Well inside the 65,536-token" comment.
  - Acceptance: a 100,000-character item yields content of at most 500 characters in total; a tweet whose description
    equals its title sends it once, so url and text still fit; a short item is unchanged; `truncated` correct.
  - Verify: `pnpm --filter @mindspool/backend test -- decisionProvider`; `pnpm typecheck`.
  - Files: `convex/decisionProvider.ts`, `convex/decisionProvider.test.ts` (update the `STATE_CHAR_BUDGET` test).
  - Skills: `test-driven-development`.

- [x] **T2: Neuron rates, estimate, day and limit helpers** (S)
  - In `decisionProvider.ts` (rates, estimate) and a new pure `convex/aiBudget.ts` (day, limit):
    `NEURONS_PER_MILLION_INPUT_TOKENS = { "clef-flash": 8182, clef: 21818 }`, `neuronsFor(provider, inputTokens)`,
    `estimateNeurons(provider, state, questions)` = `(JSON length of state + questions) / 3` tokens times the rate,
    `utcDay(ms)` -> `"YYYY-MM-DD"`, `nextResetAt(ms)` -> next 00:00 UTC, `parseDailyLimit(raw)` -> number (missing, empty,
    non-numeric, zero or negative -> `DEFAULT_DAILY_NEURON_LIMIT = 9000`).
  - Acceptance: `neuronsFor("clef-flash", 1e6) === 8182`; estimate is never below `neuronsFor(provider, actual)` for the
    four real recorded runs (use their token counts from `costUsd / 0.09 * 1e6`: ~2,590 tokens total); `utcDay` and
    `nextResetAt` right at 23:59:59.999, 00:00:00, month end and year end; `parseDailyLimit("20")` is 20, `"abc"` is 9000.
  - Verify: `pnpm --filter @mindspool/backend test -- decisionProvider aiBudget`; `pnpm typecheck`.
  - Files: `convex/decisionProvider.ts`, `convex/decisionProvider.test.ts`, `convex/aiBudget.ts`, `convex/aiBudget.test.ts`.
  - Skills: `test-driven-development`.

### Checkpoint: pure rules

- [ ] Backend tests and typecheck green. Review with the human before the schema.

## Phase 2: Backend accounting and enforcement

- [x] **T3: Usage table and reserve/settle/release** (M)
  - Schema: `aiUsage` table (`ownerId`, `day`, `neurons`, `reserved`, `inputTokens`, `runs`) with index `by_owner_day`
    `[ownerId, day]`; optional `reservedNeurons: v.number()` in `runFields` (`validators.ts`). New `convex/aiUsage.ts` with
    plain helpers over `MutationCtx`: `reserve(ctx, ownerId, estimate)` (reads/creates today's row; if
    `neurons + reserved + estimate > limit` throws `ConvexError LIMIT_REACHED` "Daily AI limit reached"; otherwise adds to
    `reserved`), `settle(ctx, ownerId, day, reserved, actualNeurons, inputTokens)` (moves `reserved` into `neurons` using the
    actual figure, `runs + 1`), `release(ctx, ownerId, day, reserved)`. The limit is read from
    `process.env.AI_DAILY_NEURON_LIMIT` via `parseDailyLimit`. The run keeps the day it reserved on (derive from the run's
    `_creationTime` via `utcDay`) so settling after midnight hits the right row.
  - Acceptance: reserve below limit adds `reserved`; reserve over limit throws and changes nothing; settle replaces the
    estimate with the actual figure; release removes the estimate; a new UTC day starts a fresh row; two owners are
    independent; a missing row is created on first reserve; negative or NaN inputs rejected.
  - Verify: `pnpm --filter @mindspool/backend test -- aiUsage`; `pnpm typecheck`.
  - Files: `convex/schema.ts`, `convex/validators.ts`, `convex/aiUsage.ts`, `convex/aiUsage.test.ts`.
  - Skills: `test-driven-development`, `convex-expert`. Sources: Convex mutations and schema docs (`convex-docs`).

- [x] **T4: Enforce on classify and save; settle and release** (M)
  - `decisions.ts`: `startDecision` computes the estimate (`buildState` of the item plus `toQuestions` of the selected
    labels), calls `reserve`, stores `reservedNeurons` on the run. `classify` lets `LIMIT_REACHED` propagate.
    New `startDecisionOrFail` (used by `items.ts` auto-label) catches `LIMIT_REACHED` and inserts a `failed` run with
    error "Daily AI limit reached" instead (no scheduled action), so saving never fails. `decisions.complete` gains
    `inputTokens` (passed by `clef.run`) and settles with `neuronsFor(provider, inputTokens)`. `processingRuns.finishRun`
    releases the reservation when a decision run finishes `failed`. Runs without `reservedNeurons` are untouched (old runs).
  - Acceptance: with `AI_DAILY_NEURON_LIMIT` low, `classify` throws `LIMIT_REACHED` and schedules nothing; `items.create`
    at the limit still saves, with a failed run "Daily AI limit reached" and the item in the Inbox; a successful run leaves
    `neurons` = actual and `reserved` = 0; a failed run leaves `reserved` = 0 and `neurons` unchanged; 50 starts in a loop
    never exceed limit + one estimate; owner A at the limit does not block owner B; settling twice counts once.
  - Verify: `pnpm --filter @mindspool/backend test`; `pnpm typecheck`.
  - Files: `convex/decisions.ts`, `convex/items.ts`, `convex/clef.ts`, `convex/processingRuns.ts`, `convex/decisions.test.ts`
    (plus `convex/clef.test.ts` for the `inputTokens` pass-through).
  - Skills: `test-driven-development`, `convex-expert`.

- [x] **T5: `aiUsage.today` and backfill** (S)
  - Public `query aiUsage.today({})` (requires auth) -> `{ used, limit, fraction, resetsAt, tokens, runs }` with
    `used = neurons + reserved`; returns zeros and the real limit when there is no row. Internal one-off
    `aiUsage.backfillToday` that, for the caller-supplied owner, sums today's `processingRuns` of kind `decision` that
    have `costUsd` and have no `reservedNeurons` into the row (neurons from `costUsd / price * rate`), idempotent via a
    `backfilled` guard (no re-adding when run twice).
  - Acceptance: `today` for a new owner is 0 of the limit; reflects reserve and settle; unauthenticated is rejected;
    backfill adds the four recorded runs (about 21 neurons) once, a second call changes nothing.
  - Verify: `pnpm --filter @mindspool/backend test -- aiUsage`; `pnpm typecheck`; regenerate `_generated`.
  - Files: `convex/aiUsage.ts`, `convex/aiUsage.test.ts`, `convex/_generated/api.d.ts`.
  - Skills: `test-driven-development`, `convex-expert`.

### Checkpoint: backend

- [ ] `pnpm check` green (except `.mcp.json`); run `convex-reviewer` on `convex/`; read the diff with
      `code-review-and-quality`; review with the human before the web work.

## Phase 3: Web

- [x] **T6: `AiUsageMeter` in the sidebar** (M)
  - New `apps/web/src/shell/AiUsageMeter.tsx` using the installed `Progress` from `@mindspool/ui/components/progress`,
    restyled by `className` only: `rounded-none`, 4px track, indicator `bg-success`; amber from 80%, `bg-destructive` at
    100% with "Limit reached · resets in 5h". Label "AI today" left, percent right; tooltip "3,420 of 9,000 neurons · 41
    runs · resets in 5h 12m". Loading: skeleton bar at the same height. Error or no data: "AI usage unavailable" (never
    hidden). Rendered in `AppSidebar` directly above `SidebarFooter` (so also in the mobile sheet). Add
    `"aiUsage:today"` to the Convex mock in `test-utils/mocks.ts` (`backend.aiUsage`, reset in `resetBackend`).
  - Acceptance: shows 0%, 4%, 85% (warning), 100% (destructive text) from mocked data; percent never above 100 in text
    while the bar value is clamped; skeleton while `undefined`; present on `/library`, `/inbox`, `/labels/…` and in the
    mobile shell test; sits before the footer in DOM order; no new dependency.
  - Verify: `pnpm --filter @mindspool/web test`; `pnpm typecheck`; `pnpm build`.
  - Files: `shell/AiUsageMeter.tsx`, `shell/AiUsageMeter.test.tsx`, `shell/AppSidebar.tsx`, `test-utils/mocks.ts`,
    `shell/MobileShell.test.tsx` (one assertion).
  - Skills: `test-driven-development`, `frontend-ui-engineering`. Sources: ReUI `c-progress-8` example and the Base UI
    Progress docs (`mcp__reui__get_examples`).

- [x] **T7: Limit message in the inspector** (S)
  - Verify the existing Classify error path shows the `LIMIT_REACHED` message ("Daily AI limit reached") as a toast, and
    that the run card shows the failed run's error for a blocked auto-label. Fix only if either does not.
  - Acceptance: a test where `backend.classify` rejects with `ConvexError({ code: "LIMIT_REACHED", message })` shows the
    message; a failed run with that error renders it in `RunCard`.
  - Verify: `pnpm --filter @mindspool/web test -- ClassifyControl RunCard`; `pnpm typecheck`.
  - Files: `inspector/ClassifyControl.test.tsx`, `inspector/RunCard.test.tsx` (and the component only if the test fails).
  - Skills: `test-driven-development`.

### Checkpoint: web

- [ ] `pnpm check` green (except `.mcp.json`); in the real app with `AI_DAILY_NEURON_LIMIT=20`: save items and watch the
      bar fill, a third is saved unlabeled with a failed run, Classify toasts the limit. Review with the human.

## Phase 4: Close-out

- [x] **T8: Docs, verification, dev backfill** (S)
  - Set `AI_DAILY_NEURON_LIMIT` handling in `packages/backend/.env.example`; update README (limit, 500-character cap,
    env var) and `CAPABILITIES.md`; write `docs/verification/ai-limit.md` (criteria 1 to 8 of the spec, with real
    command output, open manual checks, the stuck-reservation caveat); run `aiUsage.backfillToday` once on the dev
    deployment (state the deployment first); restore the default limit afterwards.
  - Acceptance: every spec success criterion is met or listed as an open manual check; README states the cap and budget.
  - Verify: `pnpm check` (report the `.mcp.json` format failure honestly); `convex data aiUsage` shows today's row.
  - Files: `README.md`, `CAPABILITIES.md`, `packages/backend/.env.example`, `docs/verification/ai-limit.md`, `SPEC-ai-limit.md` (status).
  - Skills: `documentation-and-adrs`, `verification-before-completion`.
