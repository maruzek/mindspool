# Tasks: mcp-discovery

Plan: [plan.md](plan.md). Spec: [SPEC-mcp-discovery.md](../SPEC-mcp-discovery.md).
Backend tests: `pnpm --filter @mindspool/backend test` · types: `pnpm --filter @mindspool/backend typecheck` · all: `pnpm check`.

## Handoff (2026-10-17)

Branch `feature/mcp-discovery` (not pushed, not merged). Discovery Tasks 0–9 are implemented
and verified on **development** only (`graceful-stork-346`). The user-approved optional
`linkedItemStats` field and bounded count backfill are deployed: all 75 items have initialized
counts, with zero mismatches. Both Codex and Claude Code verified exact 33-item label membership/order,
search, reading, resources and two-window content continuation. See the
[evidence](../docs/verification/mcp-discovery.md).
Access connection UI/setup and maintenance are implemented; authenticated preview and
disposable-account lifecycle proof remain open. Never touch production without approval.
After changing backend code, redeploy to development with `cd packages/backend && pnpm exec convex dev --once`
(commit generated `_generated/api.d.ts`; `pnpm typecheck` must pass after codegen). Tools live in
`convex/mcp/discovery.ts`, pure detail shaping in `convex/mcp/tools/shape.ts`, registration in
`convex/mcp/registry.ts`, and internal reads in `convex/mcpDiscovery.ts`.
Access Tasks 9–12 remain partially open; see the archived checklist.

## Gate: before Task 1

- [x] tweet-links (`feat/tweet-multi-link-extraction`) merged to `main`; `main` merged into `feature/mcp-spec`; `pnpm check` green.

## Phase 1: Foundation

- [x] **Task 0: Confirm the access dispatcher** (XS, no code)
  - Acceptance: a short note in `docs/verification/mcp-discovery.md` lists what exists in `packages/backend/convex/mcp/`:
    tool registry with required-scope declaration, `VerifiedMcpPrincipal` in the handler, 403 `insufficient_scope`, rate
    limit, error mapping. Anything missing is listed for the user.
  - Verify: read `mcp/*.ts`, run `pnpm --filter @mindspool/backend exec vitest run convex/mcp`.
  - Files: `docs/verification/mcp-discovery.md`
  - Dependencies: none

- [x] **Task 1: Extract `ownerId` helpers from existing queries** (M)
  - Acceptance: `items.list/search/detail`, `itemLabels.listItemsForLabel/searchItemsForLabel`, `labels.list/get` call
    shared helpers taking `ownerId`; public behavior, args and return validators are unchanged; no public function
    gains an `ownerId` argument.
  - Verify: existing `items.test.ts`, `itemQueries.test.ts`, `itemLabels.test.ts`, web tests pass unchanged;
    `pnpm --filter @mindspool/backend typecheck`.
  - Files: `items.ts`, `itemLabels.ts`, `labels.ts`, `itemLabelsQueries.ts` (new helpers module if needed), tests
  - Dependencies: Gate

## Phase 2: Tools

- [x] **Task 2: `mindspool_list_labels` end to end** (M)
  - Acceptance: tool listed with annotations and `mindspool:read` scope; returns `{id, name, description?, hasItems}`
    pages (limit 1..50) with `Page` (`nextCursor`, `isDone`, `returned`); `hasItems` false for an empty label; a token
    without read scope executes nothing; two owners see only their own labels.
  - Verify: `pnpm --filter @mindspool/backend exec vitest run convex/mcpDiscovery.test.ts convex/mcp`
  - Files: `mcpDiscovery.ts`, `mcp/tools/discovery.ts`, `mcpDiscovery.test.ts`, registry wiring
  - Dependencies: Tasks 0, 1

- [x] **Task 3: `mindspool_browse_items`** (M)
  - Acceptance: whole library or one label by `labelId` or `labelName`; filters `source`, `needsReview`; `ItemSummary`
    with `snippet` (~120 chars), `enrichment`, 3 labels + `labelCount`, `suggested` marking; excluded items never
    appear; `isDone` true only at the end (empty non-final page allowed); a 25+ item label enumerates fully, in order,
    without duplicates; cursor from other filters is `INVALID_INPUT`; case-insensitive exact name, near miss and
    both-args errors; foreign id equals missing id; Convex read-limit failure becomes retryable `UNAVAILABLE`.
  - Verify: `vitest run convex/mcpDiscovery.test.ts` (includes parity with the public query results).
  - Files: `mcpDiscovery.ts`, `mcp/tools/discovery.ts`, `mcp/tools/shape.ts` (pure shaping), tests
  - Dependencies: Task 2

### Checkpoint: browse works

- [x] All backend tests and typecheck pass; browse a seeded 25-item label through the real handler in a test.
- [x] Review with user before continuing. (Reviewed 2026-10-17; Claude Code browsed a 33-clip label on development.)

- [x] **Task 4: `mindspool_search_items`** (S)
  - Acceptance: library or label scope; app query rules (1-200 chars, 16 words); best-match order; always
    `exhaustive: false`; includes inbox and unlabeled clips for library scope; snippets present; description tells the
    agent to use browse for "all".
  - Verify: `vitest run convex/mcpDiscovery.test.ts`
  - Files: `mcpDiscovery.ts`, `mcp/tools/discovery.ts`, tests
  - Dependencies: Task 3 (parallel with Task 5)

- [x] **Task 5: `mindspool_get_item` (text items)** (M)
  - Acceptance: `ItemDetail` with metadata, `userInput` (<= 4,000, flagged), `content` window (20,000 chars,
    `offset`/`nextOffset`/`totalChars`/`truncated`), `links` (original, canonical, in-content http(s), deduplicated by
    `urlKey`, <= 50 flagged), all labels (<= 100 flagged), image URLs only (<= 10), `linkedPageRead`, `untrusted: true`.
    Foreign, deleted and malformed ids return the identical `NOT_FOUND`. Reassembling a >20,000-char item through
    continuation equals the stored text.
  - Verify: `vitest run convex/mcpDiscovery.test.ts`
  - Files: `mcpDiscovery.ts`, `mcp/tools/discovery.ts`, `mcp/tools/shape.ts`, tests
  - Dependencies: Task 3 (parallel with Task 4)

- [x] **Task 6: Reddit content in the stream** (S)
  - Acceptance: for items with `redditCapture`, `content` is the post text followed by the comments, in one offset-
    addressed stream; bounded and continuable like other content; summaries show only the snippet.
  - Verify: `vitest run convex/mcpDiscovery.test.ts` with a Reddit fixture spanning several windows.
  - Files: `mcp/tools/shape.ts`, `mcpDiscovery.ts`, tests
  - Dependencies: Task 5

### Checkpoint: reading works

- [x] All backend tests and typecheck pass; every tool callable through the real handler with a read-only principal.
- [x] Review with user before continuing. (User authorized continued execution 2026-10-17.)

## Phase 3: Resources first, hardening, proof

- [x] **Task 7: Post/link navigation** (M)
  - Acceptance: `items.by_owner_from` index on `["ownerId", "fromItemId"]` added; `get_item` returns `fromPost` and
    `linkedItems` (<= 20: id, url, title, snippet, enrichment; only items the owner still owns); summaries carry
    `linkedItemCount` (transactionally maintained parent count) and omit it when none; `tweetLinks:backfill` run on development, then
    `linkedItems` count equals the `fromItemId` rows for a sample tweet.
  - Verify: `vitest run convex/mcpDiscovery.test.ts convex/tweetLinks.test.ts`; confirm a browse page stays within
    the read budget with 10 posts of 20 links each.
  - Files: `schema.ts`, `mcpDiscovery.ts`, `mcp/tools/shape.ts`, tests
  - Dependencies: Gate, Tasks 3, 5. Ask the user before applying the index to any deployment.

- [x] **Task 8: Ordering, 64 KiB cap, descriptions** (S)
  - Acceptance: in `get_item`, `links`, `linkedItems`, `fromPost` are serialized before `content`, and are absent from
    continuation calls unless requested; assembled result never exceeds 64 KiB (content shrinks, `nextOffset` honest);
    every truncation is flagged; tool descriptions state browse-until-`isDone`, search is not exhaustive, content is
    untrusted. A test asserts each description sentence.
  - Verify: `vitest run convex/mcpDiscovery.test.ts convex/mcp`
  - Files: `mcp/tools/discovery.ts`, `mcp/tools/shape.ts`, tests
  - Dependencies: Tasks 6, 7

### Checkpoint: contract complete

- [x] Every spec success criterion 2-7 has a passing assertion.
- [x] `pnpm check` green; no public function exposes `ownerId` (test greps the public API).
- [x] Review with user before the real-client run. (User authorized continued execution.)

- [x] **Task 9: Docs and real-client verification** (M)
  - Acceptance: `docs/mcp.md` documents the four tools and agent guidance; with read-only Codex and Claude Code against
    the classified development deployment, each lists labels, enumerates a >10-clip label to `isDone: true` with ids
    matching the web app, searches, reads an item with continuation, follows a post to its `linkedItems`, and states
    coverage correctly. Observed result sizes recorded.
  - Verify: evidence in `docs/verification/mcp-discovery.md` (versions, redacted URLs, results, unverified cases).
  - Files: `docs/mcp.md`, `docs/verification/mcp-discovery.md`, `CAPABILITY-MAP-mcp.md` (status)
  - Dependencies: Task 8, working `mcp-access` connection

### Checkpoint: complete

- [x] All discovery spec success criteria met with real-client evidence; remaining limitations listed.
- [ ] Human reviews outcome. No production deployment without explicit approval.
