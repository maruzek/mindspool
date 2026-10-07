# Tasks: clef-labeling

Plan: [plan.md](plan.md). Spec: [SPEC-clef-labeling.md](../SPEC-clef-labeling.md). One task per turn; stop at checkpoints.
Focused tests: `pnpm --filter @mindspool/backend test`, `pnpm --filter @mindspool/web test`. Typecheck: `pnpm typecheck`.
Build: `pnpm build`. Full: `pnpm check`. Schema fields named in the spec are approved; anything else (new dependency,
extra schema, image data, retries) needs a question first. Secrets only via `convex env set`, never committed.

## Phase 1: Backend

- [x] **T1: Pure decision mapping** (S)
  - `convex/decisionProvider.ts`: constants (`LABEL_THRESHOLD` 0.5, `UNSURE_THRESHOLD` 0.65, `MAX_QUESTIONS` 64, prices, text budget),
    `DecisionProvider` interface, `selectLabels` (64 most recent, returns asked/total), `toQuestions` (noul, description → `criteria.true`),
    `buildState` (title, description, author, site, URL, text, truncated), `parseAnswers` (strict: unknown ids, non-noul, out-of-range rejected),
    `classify` split into confident/unsure/below, `costUsd`.
  - Acceptance:
    - [ ] 49.9% excluded, 50% unsure, 64.9% unsure, 65% confident.
    - [ ] 70 labels → 64 most recent selected, asked 64, total 70.
    - [ ] Description produces `criteria.true`; no description produces none.
    - [ ] Malformed or out-of-range responses throw a bounded error.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Files: `convex/decisionProvider.ts`, `convex/decisionProvider.test.ts`

- [x] **T2: Schema additions and label description API** (M)
  - Add optional fields: `itemLabels` (`origin`, `provider`, `model`, `confidence`, `runId`, `confirmedAt`), `labels.description` (max 500),
    `processingRuns` (`labelsAsked`, `labelsTotal`). `labels.create` accepts optional description; new `labels.update` edits description
    (owner only, trimmed, bounded). `labelDoc`/`runDoc` expose the new fields. Shared provider/origin types in `packages/schema`.
  - Acceptance:
    - [ ] Existing documents and tests are valid without changes.
    - [ ] Description over 500 chars or whitespace-only is rejected; empty clears it.
    - [ ] Another owner's label cannot be updated ("Not found").
  - Verify: `pnpm --filter @mindspool/backend test`, `pnpm typecheck`, `pnpm --filter @mindspool/backend codegen` leaves generated files committed.
  - Files: `convex/schema.ts`, `convex/validators.ts`, `convex/labels.ts`, `convex/labels.test.ts`, `packages/schema/src/index.ts`

- [x] **T3: Apply model labels, Keep, and run completion** (M)
  - Internal `decisions.complete` (shared helper extracted from `processingRuns.finish`): finishes the run and inserts `itemLabels` rows for
    applied labels (`origin: "model"`, provider, model, confidence, runId) only where no row exists for the pair. Public `itemLabels.confirm`
    (Keep) sets `confirmedAt`, only on the caller's own model row. `itemLabels.listForItem` returns attribution per label.
  - Acceptance:
    - [ ] Existing manual include/exclude rows are never modified by a run.
    - [ ] Re-run does not duplicate rows or re-add a label the user removed.
    - [ ] Keep keeps `origin: "model"`, provider and model, sets `confirmedAt`; foreign or manual rows are "Not found"/no-op.
    - [ ] Run and labels succeed or fail together; `processingRuns.finish` behavior unchanged.
  - Verify: `pnpm --filter @mindspool/backend test`, `pnpm typecheck`
  - Files: `convex/decisions.ts`, `convex/processingRuns.ts`, `convex/itemLabels.ts`, `convex/decisions.test.ts`, `convex/itemLabels.test.ts`

### Checkpoint: Backend core

- [ ] Backend tests and typecheck green; manual-wins and no-re-add tests present; review with human before proceeding.

- [x] **T4: Classify action and mutation (mocked provider)** (M)
  - `convex/clef.ts` internal action: load item and labels, build request, `fetch` Workers AI with env credentials, measure latency, call
    `decisions.complete` (or a failed finish). Public `decisions.classify({ itemId, model })` validates model (`clef`/`clef-flash`), enforces one
    pending decision run (`CONFLICT`), starts the run (`modality: "text"`, `questionVersion`, `labelsAsked/Total`), schedules the action.
    No labels or no text: run succeeds with no call.
  - Acceptance:
    - [ ] Provider failure, non-2xx and malformed body finish the run as `failed` with a bounded error; labels untouched.
    - [ ] Missing env vars fail the run with a clear message, not a crash.
    - [ ] Cross-owner item and labels are never read or sent.
    - [ ] Token and account id never appear in run errors or logs.
  - Verify: `pnpm --filter @mindspool/backend test` (mocked `fetch`), `pnpm typecheck`
  - Files: `convex/clef.ts`, `convex/decisions.ts`, `convex/clef.test.ts`, `convex/decisions.test.ts`

- [x] **T5: Automatic run on capture** (S)
  - `items.create` schedules the decision (Clef-flash) after a fresh insert only, never on the idempotent early return, and only when the owner has
    at least one label. Scheduling errors are swallowed so the save succeeds.
  - Acceptance:
    - [ ] New capture creates one pending decision run; repeated capture with the same key creates none.
    - [ ] Capture succeeds when scheduling or the action fails; owner with no labels triggers nothing.
  - Verify: `pnpm --filter @mindspool/backend test`
  - Files: `convex/items.ts`, `convex/items.test.ts`

- [ ] **T6: Live check against Workers AI** (S, manual, needs user credentials)
  - User runs `convex env set CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_AUTH_TOKEN` on the dev deployment. Classify one real item with both models.
    Record request/response shapes, latency, cost, and any difference from the published schemas in `docs/verification/clef-labeling.md`;
    fix `parseAnswers` and the spec if needed.
  - Acceptance:
    - [ ] Both models return a parsed run; labels at or above 50% appear with attribution.
    - [ ] Differences from the schema (if any) are fixed with tests and noted in the spec.
  - Verify: manual in Convex dashboard, then `pnpm --filter @mindspool/backend test`
  - Files: `docs/verification/clef-labeling.md`, possibly `convex/decisionProvider.ts` and its test

### Checkpoint: Backend verified against the real API

- [ ] One real item classified end to end; review with human before the web work.

## Phase 2: Web

- [x] **T7: Label description UI** (S)
  - Description field in the create-label dialog and an edit control on the label page; shown as muted text under the label heading.
    Helper text says it is sent to the model as context.
  - Acceptance:
    - [ ] Create with and without a description; edit and clear on an existing label.
    - [ ] Over-limit input shows the error and keeps the draft.
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm typecheck`
  - Files: label dialog and label route/heading components under `apps/web/src/shell` and `apps/web/src/routes`, with tests

- [x] **T8: Inspector Classify control and run card** (M)
  - "Classify" button with model picker (Clef-flash default, Clef) in the inspector; disabled while a run is pending, shows `CONFLICT`/failed
    errors readably. Notice "Asked about 64 of N labels (most recent)" when `labelsTotal > 64`. `RunCard` shows labels asked.
  - Acceptance:
    - [ ] Picker defaults to Clef-flash; chosen model is sent.
    - [ ] Pending, failed and succeeded states render; notice appears only above 64 labels.
    - [ ] Keyboard accessible, tokens only, zero radius.
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm typecheck`
  - Files: `apps/web/src/inspector/ClassifyControl.tsx`, `RunCard.tsx`, `ItemInspector.tsx`, tests

- [x] **T9: Inspector labels: AI marker, unsure, Keep and Remove** (M)
  - Model labels show an "AI" marker with provider/model and percentage in a tooltip or title; unsure ones (confidence < 0.65, not confirmed)
    show "Unsure NN%" with **Keep** and **Remove**. Remove uses the existing `itemLabels.remove`.
  - Acceptance:
    - [ ] Manual labels unchanged in look and behavior.
    - [ ] Keep removes the unsure marker, keeps the AI marker and model name; Remove excludes the label and it disappears.
    - [ ] Unsure state is not conveyed by color alone.
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm typecheck`
  - Files: `apps/web/src/inspector/InspectorLabels.tsx`, `types.ts`, tests

- [x] **T10: Library row state and unsure toast** (M)
  - Library rows/cards show "Labeling…" while a decision run is pending and an unsure marker when applicable. When a run for a visible item finishes
    with unsure labels, a toast says "N labels need a look" and opens the item.
  - Acceptance:
    - [ ] Pending then succeeded updates reactively without reload.
    - [ ] Toast fires once per finished run, not on page load for old runs.
    - [ ] No layout shift in list or grid.
  - Verify: `pnpm --filter @mindspool/web test`, `pnpm typecheck`, `pnpm build`
  - Files: `apps/web/src/library/*` (row, card, state hook), tests

### Checkpoint: Web complete

- [ ] Web tests, typecheck and build green; review with human.

- [x] **T11: Close-out** (S)
  - Finish `docs/verification/clef-labeling.md` (success criteria mapped to tests and manual checks, open manual checks at 1440/390px),
    amend the capability map (`label-suggestions` replaced by `clef-labeling`, status), update `README.md` phase note if needed.
  - Acceptance:
    - [ ] Every success criterion in the spec maps to a passing test or a recorded manual check.
    - [ ] `pnpm check` green apart from the known `.mcp.json` formatting failure.
  - Verify: `pnpm check`
  - Files: `docs/verification/clef-labeling.md`, `CAPABILITY-MAP-web-redesign.md`, `README.md`
