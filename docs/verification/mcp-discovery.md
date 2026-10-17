# Verification: mcp-discovery

Spec: [SPEC-mcp-discovery.md](../../SPEC-mcp-discovery.md). Tasks: [todo.md](../../tasks/todo.md).

## Task 0: access dispatcher inventory (2026-10-17)

Read `packages/backend/convex/mcp/*.ts`, `mcpConnections.ts`, `mcpValidators.ts`,
`http.ts` and `schema.ts` on `main` at `98302aa`.
`pnpm --filter @mindspool/backend exec vitest run convex/mcp convex/mcpConnections.test.ts`:
5 files, 105 tests passed.

### Present

| Piece                         | Where                                                                                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateless SDK transport       | `mcp/transport.ts`: `createMcpTransportHandler({ registerTools })`, fresh server per request, 64 KiB request body cap                                                                                                                                 |
| Live token verification       | `mcp/auth.ts`: `verifyMcpAccessToken` (issuer, audience, client, expiry, user status, 5 s deadline); missing `mindspool:read` throws `McpAuthorizationError("insufficient_scope")`                                                                    |
| Owner mapping and connections | `mcpConnections.authorize` (internal mutation) returns the principal `{ ownerId, subject, clientId, connectionId, scopes }`; revoked connections are `FORBIDDEN`; write scope is the intersection of the token and the connection's `allowLabelWrite` |
| Types                         | `VerifiedMcpPrincipal`, `McpScope` in `mcp/types.ts`; `mcpPrincipal` validator                                                                                                                                                                        |
| Config                        | `mcp/config.ts`: `readMcpConfig()`, disabled unless `MINDSPOOL_MCP_ENABLED=true`                                                                                                                                                                      |

### Missing (access Tasks 6–12)

- **Tool registry with required-scope declaration** (`requiredScopesForTool`,
  `mcp/tools.ts`): nothing exists; the only registration is the probe's empty one.
- **Request handler** (`mcp/handler.ts`, `handleMcpRequest`): no code composes
  verification → `authorize` → tool dispatch, so no tool receives a
  `VerifiedMcpPrincipal`.
- **`/mcp` route and protected-resource metadata**: `http.ts` only serves the
  guarded `/__mcp_probe`, which checks a browser JWT, not an OAuth token.
- **HTTP error mapping** (401 challenge, 403 `insufficient_scope`, 429, 503) and
  the domain error table for tool results.
- **Rate limits** (`mcpRateBuckets`, Task 6), **diagnostics** (`mcpDiagnostics`,
  Task 8), settings UI, client setup and revocation cleanup (Tasks 9–12).

Discovery Task 1 (owner helpers) does not depend on any of these. Tasks 2–3
need at least the registry, the handler and the domain error mapping; the plan
says to stop and report before Task 2 when they are missing.

### Resolution

Following the archived access plan, access Tasks 6–8 were built on
`feature/mcp-discovery` before discovery Task 2: `mcpRateLimit.ts` (admission
quotas), `mcp/handler.ts` + `mcp/tools.ts` + the `/mcp` and metadata routes
(registry, scope preflight and SDK scope challenges, error mapping,
`mindspool_connection`), and `mcpDiagnostics.ts` (seven-day diagnostics).
Access Checkpoint C (browser OAuth against a deployed development endpoint)
and Tasks 9–12 remain open.

## Tasks 2–3: labels and browsing (2026-10-17)

`mcpDiscovery.ts` holds the internal queries (`listLabels`, `browseItems`);
`mcp/discovery.ts` holds the tool schemas, cursor binding and result shaping;
`mcp/registry.ts` lists the served tools. The plan's `mcp/tools/discovery.ts`
and `mcp/tools/shape.ts` became `mcp/discovery.ts`, because `mcp/tools.ts`
already exists.

`convex/mcpDiscovery.test.ts` (16 tests) calls both tools through the real
handler with convex-test queries underneath. It covers:

- two owners, foreign label id equal to a missing one, and a stolen cursor;
- `hasItems` false for empty and exclude-only labels;
- a 25-clip label enumerated over three pages, ending on `isDone: true`, with
  ids equal to the app's `itemLabels.listItemsForLabel`;
- an empty non-final page (deleted items whose links remain);
- excluded clips hidden, suggested labels marked, `needsReview` narrowing,
  and the `source` filter;
- snippet trimming, three labels plus the true count;
- exact, case-insensitive label names, near-miss and both-arguments errors;
- cursors reused with other filters or tampered with rejected as `INVALID_INPUT`;
- a read-limit failure mapped to retryable `UNAVAILABLE`.

Forcing `isDone: true` made three of these tests fail.
Full backend suite: 39 files, 528 tests passed; typecheck and Prettier clean.

## Real-client check: Claude Code on development (2026-10-17)

Branch `feature/mcp-discovery` deployed to the development deployment only
(`graceful-stork-346`; production untouched). `claude mcp add --transport http
mindspool <resource URL>`, then `/mcp` browser sign-in with read-only consent.

- `mindspool_connection`: `readLibrary: true`, `editItemLabels: false`.
- `mindspool_list_labels`: 9 labels with descriptions and `hasItems`; matches the app.
- `mindspool_browse_items` on the 33-clip "Dev" label: pages of 10, 10, 10, 3;
  `isDone: true` only on the last; the agent stated that it reached the end.
- Diagnostics rows: connection created for the Claude Code client id; browse,
  list and connection calls `ok` at about 0.45 s; unauthenticated probes `invalid_token`.
- Finding: a label lists clips by when they were added to it, so `savedAt` can be
  out of order (7 inversions among the 33 clips; same order as the web app). The
  tool description and spec now say so.

Not yet verified: Codex, a write-scope token, real-client search and `get_item`, result sizes against client token budgets, revocation.

## Tasks 4–6: search and reading (2026-10-17)

All four discovery tools are registered with `mindspool:read` and read-only annotations.
Search reuses `searchItemsPage` / `searchLabelItemsPage`, preserving the app's ranking,
query validation and scope filters, with `exhaustive: false` on every page. Item detail
reuses `itemDetailFor`; label membership is read through the existing owner/item/decision
index (101 rows maximum to detect the 100-label cap). Pure response shaping lives in
`mcp/tools/shape.ts`.

`mcpDiscovery.test.ts` exercises the real handler with read-only principals and Convex
queries, covering:

- library and label search parity with the public app queries, unlabeled inbox clips,
  source and review filters, excluded membership, suggested labels and snippets;
- query limits, label scope validation, query-bound cursors and search pagination;
- detail metadata, bounded user input, safe image URLs, canonical/original/in-content
  links deduplicated by `urlKey`, including X URLs;
- exact multi-window text reassembly, past-end offsets and identical `NOT_FOUND` for
  malformed, deleted and foreign ids;
- visible 100-label and 50-link caps, and failed/pending/not-started enrichment reporting
  `linkedPageRead: false`;
- Reddit post and comments in one three-window stream, without duplicating the persisted
  projection; browse results retain only a short snippet;
- HTTP 403 before any query for each of the four tools when the principal lacks read scope.

Pure shaping tests additionally cover empty content, exact limits, canonical precedence,
balanced URL punctuation and credential-bearing URL exclusion.

Development deployment (`graceful-stork-346`) accepted `pnpm exec convex dev --once`;
generated API types are included. No production deployment or schema change.

Still unverified by real clients: search, reading and continuation (Codex and Claude Code).
Tasks 7–8 still supply post/link navigation, the whole-response 64 KiB cap and omission of
resources on continuation calls. Those remain required before claiming contract completion.

Fresh review found and regression tests reproduced two edge cases: Unicode queries
could break cursor encoding, and long punctuation tails made link trimming quadratic.
Cursors now encode/decode UTF-8 and bind trimmed queries; URL trimming counts bracket
balance once. Real-handler tests enumerate Unicode labels/search and heavily padded
queries; a 30,000-bracket test guards bounded extraction time (the previous code took
7.94 seconds). Both findings passed their regression tests after the fixes.

Validation: backend 40 files / 548 tests; schema 42 tests, web 307,
extension 128, and mobile 119 tests passed. Formatting and all six package
type checks passed. The unrestricted test run hit timeouts in existing
`itemLabels.test.ts` and `itemState.invariant.test.ts` plus a worker-start
failure during memory pressure; rerunning with `VITEST_MAX_WORKERS=2` passed.
Both review findings are resolved; no deferred review findings.

All three builds passed (`pnpm build`, including the Android export). The full
check was interrupted during mobile bundling after formatting, all tests and all
type checks passed; the build stage then completed separately. No runtime code
changed between those checks. The final backend rerun also retained the original
authorization regression alongside the new four-tool scope tests.
