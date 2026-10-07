# Clef labeling verification

Date: 2026-10-07. Branch: `feature/web-shell` (uncommitted at the time of writing).
Spec: [SPEC-clef-labeling.md](../../SPEC-clef-labeling.md). Plan: `tasks/plan.md`.

## Automated

| Check                 | Result                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm test` (backend) | 10 files, 88 tests pass (decision mapping, `decisions.complete`, Keep, action with mocked `fetch`, etc) |
| `pnpm test` (web)     | 19 files, 189 tests pass (label description, Classify control, AI/unsure labels, library state, toast)  |
| `pnpm typecheck`      | 6 of 6 workspaces pass                                                                                  |
| `pnpm build`          | passes                                                                                                  |
| `pnpm format:check`   | Fails only on `.mcp.json`, committed unformatted earlier and untouched here                             |

## Live check against Workers AI (T6)

Run by the owner on the dev deployment: **works**. The owner confirmed it end to end, and the two runs in `processingRuns`
were read back afterwards (both `clef-flash`, from the automatic run on capture):

| Field             | Run 1        | Run 2        |
| ----------------- | ------------ | ------------ |
| status            | succeeded    | succeeded    |
| model             | `clef-flash` | `clef-flash` |
| labelsAsked/Total | 5 / 5        | 5 / 5        |
| latencyMs         | 693          | 528          |
| costUsd           | 0.00005868   | 0.00005778   |
| input tokens      | about 652    | about 642    |
| applied labels    | 2            | 2            |

The published response shape (`result.answers.<id>.noul`, `result.usage.input_tokens`) parsed without changes to `parseAnswers`.
**Not recorded:** a live run with `clef` (the larger model), so the `clef` row and its cost are untested against the real API.

Free tier (10,000 neurons per day, resets 00:00 UTC): about 5.3 neurons per short item on Clef-flash, so roughly 1,900 such items a day.
Clef costs about 2.7 times more per token.

## Success criteria

| #   | Criterion                                                   | Evidence                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Capture with a label creates a Clef-flash run, never fails  | `clef.test.ts`: run created on capture, none without labels or on a repeated key, action scheduled. **Gap:** no test forces scheduling to throw (the try/catch in `items.create` is untested)                   |
| 2   | At or above 50% attached with attribution; 50 to 65% unsure | `decisionProvider.test.ts` boundaries; `decisions.test.ts` attribution; `clef.test.ts` 0.49 excluded; `InspectorLabels.test.tsx` Unsure marker, Keep, Remove, 65% confident; `useLabelingToasts.test.tsx` toast |
| 3   | A removed or manual label is never changed by a run         | `decisions.test.ts` "never modifies manual rows and never re-adds a removed label" (also re-run, no duplicates)                                                                                                 |
| 4   | Classify runs the chosen model; run card facts; "Labeling…" | `ClassifyControl.test.tsx`, `RunCard.test.tsx`, `LibraryView.test.tsx` (list and grid), `items.test.ts` preview `labeling`. Live run card in a browser: **manual check, pending**                               |
| 5   | Description sent as context; 64-label notice                | `decisionProvider.test.ts` and `clef.test.ts` (`criteria.true` in the request body); `ClassifyControl.test.tsx` notice only above 64                                                                            |
| 6   | Failure leaves item and labels intact, readable error       | `clef.test.ts`: network error, HTTP 401/500, invalid JSON, malformed body, missing credentials; run `failed`, no labels, no token or account id in the error                                                    |
| 7   | Another owner's data is never read, written or sent         | `clef.test.ts` (foreign label not in request body; run/item owner mismatch sends nothing), `decisions.test.ts`, `itemLabels.test.ts` (foreign Keep "Not found"), `labels.test.ts`                               |
| 8   | `pnpm check` passes; live check documented                  | Test, typecheck and build pass; format fails only on `.mcp.json`; live check recorded above                                                                                                                     |

## Behavior added beyond the spec

- A user decision on a model row (Remove, then attach again) clears the model attribution and sets `origin: "manual"`.
- `items.list` and `itemLabels.listItemsForLabel` previews gain optional `labeling`, `unsureCount` and `unsure` per label, read from at most
  3 recent runs and the 4 links already read per item.
- `packages/schema` exports `UNSURE_THRESHOLD` and `MAX_LABEL_QUESTIONS`, duplicated from the backend constants.

## Known limits

- A decision run whose action process dies stays `pending` and blocks Classify with `CONFLICT` (no stale-run timeout, no retries, per the spec).
- Label counts scan at most 1000 labels per run.
- `unsureCount` and the unsure marker in library rows only see the first 4 labels of an item.
- Grid cards for an item with no labels gain one chip line while "Labeling…" shows.

## Manual checks still open

- [ ] Inspector at 1440px, 1024px and 390px: the unsure tag (name, Unsure, Keep, Remove) fits the 380px panel.
- [ ] Library list and grid at 1440px and 390px: "Labeling…" appears and clears without a visible jump.
- [ ] One live run with `clef` (not only `clef-flash`).
- [ ] Toast appears after saving a note with an unsure result and "Open" selects the item.
