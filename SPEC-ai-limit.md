# Spec: ai-limit

Status: implemented; see [the verification report](docs/verification/ai-limit.md).

Single-capability feature (no capability map needed). Depends on the implemented `clef-labeling`; adds a daily AI budget
per owner and a always-visible usage bar in the sidebar. Not part of the web-redesign map; it is a guardrail around
the one place the app spends AI today.

## Objective

Keep the owner inside Cloudflare Workers AI's free tier with two guards: (1) **limit what we send**: at most 500
characters of item content go to the model per classification; (2) **limit how often**: each owner gets a daily AI
budget, every Clef call is counted against it, and when it is spent new labeling is refused until the day resets. A progress bar just above the sidebar footer
(the user name) always shows how much of today's budget is used.

Success looks like: the sidebar shows "AI today 4%" with a thin green bar; a long article is classified from its first
500 characters only; saving items moves it; at the limit the bar is full
and red, new items are still saved but are not auto-labeled and the inspector says why; after 00:00 UTC the bar resets.

## What I found (facts, not assumptions)

- **Free tier** ([pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/)): 10,000 Neurons per day at
  no charge, reset daily at **00:00 UTC**. Beyond that, "further operations will fail with an error" (on the Free plan
  there is no surprise bill; the call just fails). It is **per Cloudflare account**, not per app or user.
- **Clef pricing**: `clef-flash` $0.09 / M input tokens = **8,182 neurons / M**; `clef` $0.24 / M = **21,818 neurons / M**.
  Output is not billed (already assumed in `decisionProvider.ts`).
- **Every response reports `usage.input_tokens`**, which `decisionProvider.parseUsage` already reads and `clef.run` turns
  into `costUsd` on the `processingRuns` row. So exact spend is knowable after each call; no estimating is needed for
  accounting, only for the pre-flight guard.
- **Spend so far (dev deployment, queried read-only)**: 4 runs, all `clef-flash`, today, total $0.000233 = about
  **21 neurons (0.2% of today's budget)**. At ~5 neurons per short item, 10,000 neurons is roughly 1,900 items a day on
  Clef-flash; a worst-case item (60,000 characters, Clef) is about 330 neurons.

## Assumptions (correct me now or I proceed with these)

1. **Unit is neurons**, not tokens or dollars: it is what Cloudflare's limit is expressed in, and tokens from the two
   models are not comparable (Clef costs 2.7x per token). Tokens and USD are shown in a tooltip only.
2. **Day = UTC day**, matching Cloudflare's reset, so "resets in 5h" is true.
3. **Daily budget defaults to 9,000 neurons (90% of 10,000)** (confirmed) as a safety margin for rounding and concurrent
   in-flight runs; nothing else on the account uses Workers AI (confirmed). Configurable by Convex env var `AI_DAILY_NEURON_LIMIT`
   (no UI for editing it).
4. **Only `decision` runs on Clef count.** Enrichment does not call Workers AI today. When a new Workers AI caller is
   added it must go through the same recorder.
5. **Enforcement is server-side, in Convex**, at the point a decision run is created (`startDecision`, used by both
   auto-labeling on save and the inspector's Classify). The browser only displays.
6. **Reserve, then settle**: at start, a conservative estimate ((state characters + question characters) / 3 as tokens,
   times the model's rate) is added to today's usage; on completion the estimate is replaced by the real
   `input_tokens` figure; on failure it is released (a failed call before the model ran costs nothing; a failed call is
   not billed). This closes the gap where a burst of saves would all pass the check before any finished.
7. **When the budget is spent**: `classify` throws a `ConvexError` `LIMIT_REACHED` (the inspector shows it as a toast);
   auto-labeling on save records a **failed run** with the fixed message "Daily AI limit reached" and the item is still
   saved. Nothing is queued for later; the owner re-runs Classify after the reset.
8. **One per-owner row per day** (`aiUsage`), not a global counter, so a second user later gets their own budget. The
   free tier is still account-wide: with several users the per-owner limit must be lowered by hand.
9. The bar is shown to every signed-in user, in the sidebar and in the mobile sheet (same component).

## Input limit (what we send)

- **`AI_INPUT_CHAR_LIMIT = 500`** replaces `STATE_CHAR_BUDGET = 60000` in `decisionProvider.ts`. It is a **total** for the
  item content sent in `state`, filled in the existing priority order (title, description, author, site, url, text), so a
  tweet's text always fits and a long article contributes only what is left after its title. `state.truncated` stays.
- **Fields that repeat an earlier field are skipped** (e.g. a tweet whose description equals its title), so the 500 are
  not spent twice on the same words. This is the one behavior I added beyond your request; say so if you'd rather not.
- The label questions (up to 64, each "Does this item belong in the label …?" plus its description) are **not** part of the 500;
  they are what decides which labels are asked and are capped by `MAX_QUESTIONS` already. They are counted in the estimate.
- Effect on cost: an item is at most ~170 tokens, so a run with 64 labels is dominated by the questions (~1k tokens,
  about 8 neurons on Clef-flash); worst case on Clef is about 25 neurons. The 9,000 budget is then roughly 1,000+ runs a day.
- This also lowers the cost of every existing re-run and removes the 60,000-character worst case from the estimate.

## Tech stack

Existing: Convex 1.46 (queries, mutations, internal actions), React + TanStack Router, `@mindspool/ui` (the shadcn/ReUI
`progress.tsx` (Base UI) is already installed, as are `sidebar.tsx` and `tooltip.tsx`), Vitest + convex-test + Testing Library. **No new dependencies.**

## Commands

```
Typecheck:      pnpm typecheck
Backend tests:  pnpm --filter @mindspool/backend test
Web tests:      pnpm --filter @mindspool/web test
Full gate:      pnpm check
Set the limit:  pnpm --filter @mindspool/backend exec convex env set AI_DAILY_NEURON_LIMIT 9000
Inspect usage:  pnpm --filter @mindspool/backend exec convex data aiUsage
Dev:            pnpm dev
```

## Project structure

```
packages/backend/convex/
  schema.ts              → add aiUsage table (+ validators.ts field set)
  aiUsage.ts             → NEW: reserve / settle / release (internal), `today` query (public)
  aiUsage.test.ts        → NEW
  decisionProvider.ts    → AI_INPUT_CHAR_LIMIT (500, replaces STATE_CHAR_BUDGET), duplicate-field skip in buildState,
                           NEURONS_PER_MILLION_INPUT_TOKENS, neuronsFor(), estimateNeurons(state, questions)
  decisions.ts           → startDecision: reserve or fail with LIMIT_REACHED; complete/failure: settle/release
  clef.ts                → pass real inputTokens to settle
apps/web/src/shell/
  AiUsageMeter.tsx       → NEW: bar + label + tooltip, uses api.aiUsage.today
  AiUsageMeter.test.tsx  → NEW
  AppSidebar.tsx         → render the meter directly above <SidebarFooter>
README.md, CAPABILITIES.md, docs/verification/ai-limit.md → updated at the end
```

## Data and API

```ts
// aiUsage (one row per owner per UTC day)
{ ownerId: string, day: "2026-10-07", neurons: number /* settled */, reserved: number /* in flight */,
  inputTokens: number, runs: number }          // index by_owner_day [ownerId, day]

// processingRuns gets one optional field so settle/release is exact and idempotent
reservedNeurons?: number

// public query, reactive
api.aiUsage.today({}) -> { used: number, limit: number, fraction: number /* 0..1+ */,
                           resetsAt: number /* ms, next 00:00 UTC */, tokens: number, runs: number }
```

`used = neurons + reserved`. Schema changes: one new table and one optional field; both need your approval (see Boundaries).

## UI

```
 ┌ sidebar ──────────────┐
 │ …Labels…              │
 │───────────────────────│
 │ AI today        4%    │   label left, percent right (tokens used, 11px uppercase like other captions)
 │ ▓░░░░░░░░░░░░░░░░░░░  │   thin progress bar, zero radius, tokens only
 │───────────────────────│
 │ [avatar] Martin R. ⋯  │   existing footer
 └───────────────────────┘
```

- **Built on the installed `Progress` (ReUI/shadcn, Base UI), not hand-rolled**; the track and indicator are restyled with
  `className` only, following ReUI's "custom colors" example (`c-progress-8`): `rounded-none`, 4px track on `bg-muted`/
  sidebar border token, **indicator `bg-success` (green)**. The shared `progress.tsx` keeps its defaults for other uses.
- Always rendered (not collapsible, not dismissible), directly above `SidebarFooter`.
- Tooltip / `title`: "3,420 of 9,000 neurons · 41 runs · resets in 5h 12m".
- Colors from existing tokens: green (`--success`) normally; amber warning ≥ 80%; `--destructive` at 100% with text "Limit reached · resets in 5h".
- Loading: skeleton bar at the same height (no layout shift). Query error: bar hidden is **not** allowed; show "AI usage unavailable".
- Updates live (Convex query), so it moves when a labeling run finishes.

## Code style

Matches the repo: pure functions in `decisionProvider.ts` with tests, Convex functions with `args`/`returns`
validators, owner from `requireOwner(ctx)`, `ConvexError({ code, message })`, fixed error strings only.

```ts
export const NEURONS_PER_MILLION_INPUT_TOKENS = {
  "clef-flash": 8182,
  clef: 21818,
} as const;
export const neuronsFor = (provider: ClefProvider, inputTokens: number) =>
  (inputTokens / 1e6) * NEURONS_PER_MILLION_INPUT_TOKENS[provider];
```

## Testing strategy

TDD per task. **Backend (convex-test)**: day rollover (new UTC day starts at 0); reserve adds, settle replaces estimate with
actual, release removes; reserve at/over the limit throws `LIMIT_REACHED` and creates no scheduled action; burst of N starts
cannot exceed limit + one run; owners are isolated (A's usage invisible to and not counted for B); settle is idempotent
(run settled twice counts once); failed run releases; limit env var parsing (missing/garbage falls back to 9000);
`today` requires auth. **Pure**: `neuronsFor`, `estimateNeurons` never underestimates against recorded real usage
(compare with the 4 real runs), reset time computation across month/year ends. **Web**: renders percent and bar value,
warning/destructive states, loading skeleton, error text, sits above the footer in the sidebar and the mobile sheet.
No accessibility audits (project preference). Manual: save an item and watch the bar move; set limit to 20 and confirm
refusal and the inspector toast.

## Boundaries

- **Always:** run `pnpm check` before declaring a task done; enforce in Convex, never in the browser; fixed error
  strings; tokens/secrets never logged; one task per turn.
- **Ask first:** the schema changes above (new table, new run field); any new dependency; changing the default
  limit; adding a UI to edit the limit.
- **Never:** call Workers AI from the browser; let the bar be hidden or collapsed; block _saving_ an item because the AI
  budget is spent; commit tokens; push to origin.

## Success criteria

1. Sidebar shows the bar above the user footer on `/library`, `/inbox`, `/labels/…`, and in the mobile sheet, in all states.
2. After a labeling run finishes, `aiUsage.neurons` for today equals `Σ inputTokens × rate` of that day's runs (within 1
   neuron), and the bar reflects it without reload.
3. With `AI_DAILY_NEURON_LIMIT=20` a third short item is saved but not labeled; its run is `failed` with "Daily AI limit
   reached"; Classify shows a toast with the same message.
4. 50 items saved in a burst never push (`neurons + reserved`) past the limit by more than one run's estimate.
5. Today's four existing runs are backfilled once (script or `convex run`), after which the bar shows about 0.2%.
6. A run's `state` never exceeds 500 characters of item content (test with a 100,000-character item).
7. The count restarts at the first run after 00:00 UTC; `resetsAt` is correct.
8. `pnpm check` passes; no new dependencies.

## Decisions made

1. Default budget 9,000 neurons. 2. A blocked auto-label is a failed run (item shows in Inbox). 3. Nothing else uses Workers AI
   on the account. 4. Percent on the bar, numbers in the tooltip. 5. Backfill today's four existing runs once (about 21 neurons).
2. Item content sent to the model is capped at 500 characters. 7. Use the installed ReUI Progress, restyled green.

## Open questions

1. **Duplicate-field skip** (see Input limit): OK to include? Without it a tweet's title and description (often identical)
   can use up the 500 before the url or text is reached.
2. **Existing items**: the new 500-character cap applies to new runs only; old runs are not re-labeled. OK?
