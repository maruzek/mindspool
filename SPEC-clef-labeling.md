# Spec: clef-labeling

Module id `clef-labeling`. It implements and **replaces** `label-suggestions` in
[CAPABILITY-MAP-web-redesign.md](CAPABILITY-MAP-web-redesign.md) (the map row is amended with this spec).
Depends on the implemented `item-inspector`, `library-view` and the `core-library` backend.
Scope: Convex backend plus `apps/web`. Mobile and extension are out of scope; they only gain the behavior
automatically because capture already goes through `items.create`.

## Objective

Let Cloudflare's **Clef** / **Clef-flash** decision models (Workers AI, released 2026-10-01) label saved items.
For one item, Clef answers a yes/no question per existing label; every label with probability **≥ 50%** is
added to the item automatically. The owner can see why (run, model, confidence), and remove a model-added label
in place; a removed label is never re-added by a later run.

Success: the owner saves a link or note, within seconds it gains labels with an "AI" marker and confidence, the
inspector shows the run (model, modality, latency, cost), and "Classify" re-runs it with Clef-flash or Clef.

User: a single signed-in owner, desktop first.

## Assumptions

1. **Trigger: both.** Automatic after capture (scheduled from `items.create`), plus a manual "Classify" action in the
   inspector with a model picker (**Clef-flash default**, Clef selectable per run).
2. **Question design:** one `noul` question per existing label, `instructions: "Does this item belong in the label '<name>'?"`.
   When the label has a **description**, it is sent as `criteria.true` (what a yes means) so the model has context.
   Question id = the label's Convex id (alphanumeric, valid). Score and choice questions are **not** used yet.
   Per the published schemas, the answer for each id is `{ "type": "noul", "noul": <0..1> }` (probability of yes) and
   the response carries `model` and `usage.input_tokens/output_tokens`.
3. **64-label limit, visible to the user.** Clef accepts 1–64 questions per request, so each run asks about the
   **64 most recently created labels**. The run records `labelsAsked` and `labelsTotal`. When `labelsTotal > 64`
   the run card and the Classify control say "Asked about 64 of N labels (most recent)", so the user knows older
   labels are not considered.
   3a. **Label descriptions:** `labels` gets an optional `description` (max 500 chars), editable from the label page and
   the create-label dialog. (The "starting guidelines" in `sampleContent.ts` are seed text only, not a stored field;
   they are not used, but the seed may be updated to fill descriptions.)
4. **Threshold and "unsure":** a label is applied when its probability is `>= 0.5` (`LABEL_THRESHOLD`). Probabilities
   from `0.5` up to but excluding `0.65` (`UNSURE_THRESHOLD`) are applied but flagged **unsure**; `>= 0.65` is confident.
   Both are named constants. `processingRuns.suggestions` records every applied label with its probability (0–1).
   **Unsure UX:** an unsure label shows an "Unsure" marker with its percentage in the inspector and library row, with
   two one-click actions: **Keep** (confirm: it becomes a normal label, attribution retained) and **Remove** (existing
   manual exclude). When a run adds unsure labels, a toast tells the user ("2 labels need a look") linking to the item.
5. **Manual always wins; model attribution is kept on `itemLabels`.** New optional fields on `itemLabels`:
   `origin` (`"manual"` | `"model"`, absent = manual), `provider` (`"clef"` | `"clef-flash"`), `model` (string),
   `confidence` (0–1), `runId`, `confirmedAt` (set by Keep). Model labels never overwrite an existing row for the
   pair, including manual `exclude`. Removing a model label uses `itemLabels.remove` (manual exclude), which blocks
   re-adding. **Approved by the user:** fields on `itemLabels`, no separate table.
6. **Input is text only** in this version (`modality: "text"`). State is JSON built from title, description,
   author, site name, URL and extracted text/original input, truncated to a fixed character budget well inside the
   65,536-token window. Images (up to 4, 4 MiB each) are deferred until image assets are fetched and stored.
7. **Execution:** a Convex `internalAction` calls the Workers AI REST endpoint
   `POST /accounts/{id}/ai/run/@cf/cloudflare/clef` with `Authorization: Bearer`, using Convex env vars
   `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AUTH_TOKEN` (never in the repo or the browser). Provider calls sit behind
   a small `DecisionProvider` interface so Jev and OpenAI Decisions can be added later.
8. **Run lifecycle** reuses `processingRuns.start` / `finish` (`kind: "decision"`, `provider: "clef" | "clef-flash"`).
   At most one pending decision run per item; a second request returns `CONFLICT`. Failures (network, 4xx/5xx,
   malformed response) finish the run as `failed` with a bounded error and never touch labels. No automatic retry
   in this version; the manual button is the retry.
9. **Cost and latency** are recorded: `latencyMs` measured around the call, `costUsd = input_tokens / 1e6 × price`
   ($0.09 Clef-flash, $0.24 Clef; prices in one constant).
10. With **no labels** or an item with no usable text the action finishes the run as succeeded with empty suggestions
    and does not call Clef.
11. The web inspector's `RunCard` and label chips are extended, not replaced; components come from the existing
    `packages/ui` and ReUI set, tokens only, zero radius, Archivo.

## Tech Stack

Convex 1.46 (actions, scheduler, `convex-test`), React 19.2, TanStack Router, Vitest, TypeScript 6, pnpm 12, Turbo.
No new dependencies: `fetch` inside the action.

## Commands

```
Dev (all):        pnpm dev            # web
Dev backend:      pnpm dev:backend    # convex dev
Test backend:     pnpm --filter @mindspool/backend test
Test web:         pnpm --filter @mindspool/web test
Typecheck:        pnpm typecheck
Full gate:        pnpm check          # format:check, tests, typecheck, build
Set secrets:      pnpm --filter @mindspool/backend exec convex env set CLOUDFLARE_ACCOUNT_ID <id>
                  pnpm --filter @mindspool/backend exec convex env set CLOUDFLARE_AUTH_TOKEN <token>
```

## Project Structure

```
packages/backend/convex/
  clef.ts              → internalAction: build state/questions, call provider, map answers, finish run
  decisionProvider.ts  → DecisionProvider interface + Workers AI (Clef) implementation, pure request/response mapping
  decisions.ts         → public mutation classify(itemId, model); internal helpers to apply model labels
  itemLabels.ts        → origin/provider/model/confidence/runId/confirmedAt on rows; apply-model-label and confirm (Keep) mutations
  labels.ts            → optional description on create/update
  items.ts             → create schedules the automatic run
  *.test.ts            → convex-test with mocked fetch
packages/schema/src    → "clef-flash" | "clef" provider and origin types shared with web
apps/web/src/inspector → Classify control, suggestion/AI marker in InspectorLabels, RunCard fields
apps/web/src/library   → "Labeling…" state while a decision run is pending
SPEC-clef-labeling.md, tasks/plan.md, tasks/todo.md, docs/verification/clef-labeling.md
```

## Code Style

Match the repo: object-form Convex functions with validators, `ConvexError({ code, message })`, ownership via
`requireOwner` / `requireOwned`, small pure mapping functions tested without Convex.

```ts
export function toQuestions(labels: { _id: string; name: string }[]) {
  return Object.fromEntries(
    labels.slice(0, MAX_QUESTIONS) // callers pass the 64 most recent.map((label) => [
      label._id,
      {
        type: "noul",
        instructions: `Does this item belong in the label "${label.name}"?`,
        ...(label.description && { criteria: { true: label.description } }),
      },
    ]),
  );
}
```

## Testing Strategy

- **Pure mapping** (Vitest): questions from labels, state truncation, answers → suggestions at the threshold
  (49.9% out, 50% in, 64.9% unsure, 65% confident), the 64-most-recent selection, description → `criteria.true`, cost calculation, malformed responses rejected.
- **Backend** (`convex-test`, mocked `fetch`): auth and cross-owner isolation; a run is created, finished and
  labels applied with provider/model attribution; Keep and Remove on unsure labels; manual `exclude` and existing manual `include` untouched; re-run does not duplicate or re-add a
  removed label; concurrent request → `CONFLICT`; provider failure → failed run, no labels; no labels → no call;
  auto-run scheduled on capture and capture still succeeds if the schedule/provider fails.
- **Web** (Vitest + Testing Library): Classify control with model picker, the "64 of N labels" notice, unsure marker with Keep/Remove, toast, label description editing, pending/failed/succeeded run states,
  AI marker with confidence, removing a model label, library "Labeling…" state.
- **Live check (manual, one task):** one real call confirms the published schema (noul shape, usage) against the
  mapper; recorded in `docs/verification/clef-labeling.md`.
- `pnpm check` must pass; no skipped or weakened existing tests.

## Boundaries

- **Always:** derive ownership server-side; keep secrets in Convex env; bound every string, count and cost value;
  keep model output separate from manual decisions; run `pnpm check` before declaring a task done; one task per turn.
- **Ask first:** any schema change beyond the `itemLabels` and `labels.description` fields and the `labelsAsked`/`labelsTotal` run fields named here; any new dependency; changing the threshold semantics;
  sending image data; adding scheduled crons or retries.
- **Never:** call Workers AI from the browser; commit tokens; let a model result overwrite a manual decision;
  delete or skip failing tests; fail a capture because classification failed.

## Success Criteria

1. Saving an item with at least one label existing creates a `decision` run for `clef-flash` without delaying or
   failing the save.
2. Labels with probability ≥ 0.5 are attached with `origin: "model"`, provider, model, confidence and run id; labels below are not. 0.5–0.65 are flagged unsure.
   Unsure labels offer Keep/Remove and trigger a toast.
3. A label the user removed (manual exclude) or manually included is never changed by any run.
4. "Classify" in the inspector runs the chosen model; the run card shows provider, model, modality, status, error,
   latency and cost; the library row shows "Labeling…" while pending.
5. Labels with a description send it as context; when there are more than 64 labels the UI says only the 64 most recent were asked.
6. Failure paths leave the item and its labels intact and show a readable error.
7. Another user's items and labels are never read, written or sent to Clef (tested).
8. `pnpm check` passes; all new behavior has tests; the live check result is documented.

## Open Questions

1. Run records add `labelsAsked` and `labelsTotal` (optional numbers) to `processingRuns`; included here as part of the approved
   notice, but confirm you are fine with that small run-schema addition.
2. "Keep" on an unsure label: proposed to set `confirmedAt` and keep `origin: "model"` (attribution preserved, unsure marker
   removed). Alternative: convert to a manual include. Which?
3. Toast scope: shown in the web app when a run that you are watching finishes with unsure labels; no email/push. OK?
4. Automatic retries/backoff are left out; add later with the evaluation work?
