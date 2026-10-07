# Implementation Plan: clef-labeling

Spec: [SPEC-clef-labeling.md](../SPEC-clef-labeling.md) (approved; open questions resolved: run fields `labelsAsked` /
`labelsTotal` OK, Keep retains `origin: "model"`, web-only toast OK, no retries). Capability map:
[CAPABILITY-MAP-web-redesign.md](../CAPABILITY-MAP-web-redesign.md), replaces `label-suggestions`. Tasks:
[todo.md](todo.md). The item-inspector plan is archived in `tasks/archive/item-inspector-*.md` (its manual checks remain in
`docs/verification/item-inspector.md`).

## Overview

Classify saved items with Cloudflare Clef / Clef-flash. One `noul` question per label (64 most recent, label description as
`criteria.true`); labels with probability >= 0.5 are attached with model attribution, 0.5 to 0.65 flagged "Unsure" with
Keep/Remove. Runs automatically after capture and manually from the inspector with a model picker. Backend first
(pure mapping, schema, apply/confirm, action, scheduling), then a real-API check, then the web UI from the inspector outward.

## Architecture Decisions

- **Pure core first.** Question building, state building, answer parsing, threshold/unsure split and cost live in
  `decisionProvider.ts` with no Convex or network, so most logic is tested cheaply and the provider interface (`DecisionProvider`)
  is ready for Jev later.
- **Schema once, early (T2).** `itemLabels` (+ `origin`, `provider`, `model`, `confidence`, `runId`, `confirmedAt`), `labels.description`,
  `processingRuns` (+ `labelsAsked`, `labelsTotal`). All optional, so no migration and existing rows stay valid. Approved in the spec.
  `manualDecision` keeps its name; model rows are `"include"` with `origin: "model"` (renaming is a migration, deferred).
- **One completion mutation.** Run completion and label application happen in a single internal mutation (`decisions.complete`) built on
  a helper extracted from `processingRuns.finish`, so a run can never be "succeeded" without its labels. `finish` keeps its behavior.
- **Manual wins, enforced in one place.** The apply step inserts a row only when none exists for the pair. Nothing else writes `origin: "model"`.
- **Real API checked before UI (T6).** The action is built against the published schemas with a mocked `fetch`; one manual call
  confirms them before any web work, so a wrong assumption costs backend tasks only.
- **Automatic run is best-effort.** `items.create` schedules the action after insert (idempotent capture returns early, so a retried capture
  never schedules twice); a scheduling or provider failure never fails the save.
- **Web reads existing paths.** `itemLabels.listForItem` is extended to return attribution; `processingRuns.listForItem` already streams run state,
  which drives "Labeling…" and the toast reactively. No polling.
- **Not in this module:** images, Jev/OpenAI providers, retries/backoff, choice/score questions, email/push, cron reprocessing.

## Dependency Graph

```
T1 pure mapping ─┐
                 ├─ T3 apply/confirm/complete ── T4 classify action ── T5 auto-run on capture
T2 schema ───────┘                                   │
                                                     └─ T6 live check (manual) ── T8 classify control ── T9 labels: AI / unsure / Keep
T2 ── T7 label description UI                                                     └─ T10 library row + toast ── T11 close-out
```

T7 is independent of T3 to T6 and may be done in any order after T2.

## Task List

### Phase 1: Backend

- [x] T1 Pure decision mapping
- [x] T2 Schema additions and label descriptions API
- [x] T3 Apply model labels, Keep, and run completion

### Checkpoint: Backend core

- [ ] `pnpm --filter @mindspool/backend test` and `pnpm typecheck` green; reviewed with human

- [x] T4 Classify action and mutation (mocked provider)
- [x] T5 Automatic run on capture
- [ ] T6 Live check against Workers AI (manual, needs credentials)

### Checkpoint: Backend verified against the real API

- [ ] One real item classified end to end; verification doc started; spec updated if the response differed

### Phase 2: Web

- [x] T7 Label description UI
- [x] T8 Inspector Classify control and run card
- [x] T9 Inspector labels: AI marker, unsure, Keep and Remove
- [x] T10 Library row state and unsure toast

### Checkpoint: Complete

- [x] T11 Verification doc, capability map, `pnpm check`; all SPEC success criteria met; ready for review

## Risks and Mitigations

| Risk                                                    | Impact | Mitigation                                                                                                                |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Real response differs from the published schema         | Med    | T1 parser is strict and isolated; T6 checks it before any web work                                                        |
| Cloudflare token or account id missing/wrong            | Med    | Clear `failed` run with bounded error; T6 documents the exact env commands                                                |
| Action on capture slows or fails the save               | High   | Scheduled (not awaited) after insert; test that save succeeds when the action throws                                      |
| Race: two classify requests, or reprocess during delete | Med    | One pending decision run per item (`CONFLICT`); apply step re-checks item and label exist in the same transaction         |
| Model re-adds a label the user removed                  | High   | Apply inserts only when no pair row exists; covered by a dedicated test                                                   |
| Large item text exceeds the context window              | Low    | Fixed character budget on state; tested                                                                                   |
| Prompt injection from saved page text                   | Med    | Model output only maps to known label ids and numbers in [0,1]; nothing from the model is executed or stored as free text |
| Cost surprise on bulk imports                           | Low    | Auto-run is one call per new item; cost recorded per run; no retries                                                      |

## Open Questions

- None blocking. Threshold values (0.5 / 0.65) are constants and can change without migration.
