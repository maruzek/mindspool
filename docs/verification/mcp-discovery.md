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
