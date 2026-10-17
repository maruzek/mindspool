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
