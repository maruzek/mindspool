# Hosted MCP Access Implementation Plan

> For agentic workers: read this plan, [the spec](../../SPEC-mcp-access.md), and
> [the task list](mcp-access-todo.md). After plan approval, use `executing-plans` for native
> execution or `subagent-driven-development` only if the user selects delegated
> execution. Complete one task and its verification before advancing.

**Goal:** Codex and Claude Code can connect to the user's existing MindSpool
account, with read-only access by default, optional label-write permission, and
working server-side disconnect controls.

**Architecture:** A stateless MCP endpoint lives in the existing Convex backend.
Clerk performs OAuth sign-in and consent; the backend verifies each request and
resolves its user to existing library ownership. Convex stores connection state,
shared request quotas, and short-lived diagnostics; the existing web app provides
connection management.

**Tech stack:** Existing Convex 1.46.0, TypeScript 6.0.3, React 19.2.3,
`@clerk/react` 6.17.5, Vitest 5.0.3, `convex-test` 0.0.60. Proposed additions:
`@modelcontextprotocol/server` 2.3.1 and Zod 4.6.7 as runtime dependencies;
`@modelcontextprotocol/client` 2.3.1 as a backend test dependency.

**Spec:** [SPEC-mcp-access.md](../../SPEC-mcp-access.md).
**Status:** implementation authorized by the user's “begin on the work” instruction,
2026-10-16. Tasks 1–3 and Checkpoint A are complete. Both read-only provider flows, the real
second-resource rejection, and the hosted runtime have passed. Tasks 4 and 5 are implemented; Checkpoint B is ready for review. See [the evidence](../../docs/verification/mcp-access.md).

## Integration update (2026-10-17)

The user authorized consolidating the tweet-link and MCP branches into local
`main`. The implementation-phase worktree restriction below records the original
isolation rule; the authorized merge supersedes it for integration. Tasks 1–5
are implemented. Tasks 6–12 remain open and must be completed before claiming
usable MCP access. The endpoint stays disabled during integration. This access
plan remains the record for that unfinished work even though the discovery plan
now occupies `tasks/plan.md`.

## Scope and global constraints

- Work only in `/home/martin/dev/MindSpool-mcp-spec`, branch `feature/mcp-spec`.
  Do not switch, reset, stash, or modify the original checkout's work.
- This plan implements `mcp-access`. Clip search, label browsing, and actual
  item-label writes need the later module specs and are outside this plan.
- Node >=24.12.0; pnpm 12.8.1. Preserve the lockfile and install-script policy.
- Canonical resource: `https://<deployment>.convex.site/mcp`; environment-specific
  configuration, no new hosting service or DNS requirement.
- `mindspool:read` is required. `mindspool:labels:write` also requires both
  explicit app-side enablement and provider-granted write scope.
- Decoded request limit 64 KiB; request budget 15 seconds; combined provider
  verification/user-status budget five seconds; no positive authorization cache.
- At most 120 protected requests and 30 write calls per connection per minute;
  shared deployment-level counters, never process-local counters.
- Existing app JWT authentication and allowed-account rules remain intact.
- Diagnostic retention at most seven days; no credentials, clip content, search
  queries, URLs, titles, or email in telemetry.
- No production change is authorized by approving this plan. Classify development
  targets before any Convex or Clerk operation. Never print secret env values.

## Feasibility gates and source findings

This is a gated implementation plan. Approval authorizes the ordered approach;
it does not assert that the open proofs have passed. Only Tasks 1–3 may run before
Checkpoint A. A failed proof requires a concrete spec/plan revision before the
dependent feature work, rather than a skipped check or alternative infrastructure.

1. **Clerk proof:** verify custom scopes, client registration, resource binding,
   active-user status, opaque-token revocation, refresh, and grant-revocation
   capabilities in the development instance. Capture actual response field names
   in sanitized fixtures. A client ID or custom scope alone is not proof that a
   token was issued for this resource.
2. **Ownership proof:** compare verified OAuth subject/issuer handling against
   the existing web user's actual Convex `tokenIdentifier`. Use exact configured
   issuer identity; never normalize a new issuer or use email to guess ownership.
3. **Runtime proof:** pin the SDK, test its actual Request/Response transport,
   bundle it for Convex, and exercise a development-only smoke route. No Node HTTP
   listener, Express dependency, handwritten protocol, or unsupported-runtime shim.

Read-only research found the official SDK's stable v2 split packages. The exact
2.3.1 published server declarations export `McpServer` and
`WebStandardStreamableHTTPServerTransport`, whose `handleRequest` accepts a Web
`Request`. Its options include stateless mode, JSON responses, and request-size
limits. This is a candidate, not proof of Convex runtime compatibility.
Sources: [official SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[server package](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/server/package.json),
[transport source](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/server/src/server/streamableHttp.ts).
Published npm metadata and declarations for 2.3.1 were inspected without installation.

The current [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
still requires intended-resource validation. Preserve the approved spec's HTTP
behavior and compatibility with the target clients when using the newer SDK;
do not silently add its newer optional protocol features. Clerk's
[verification guide](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens)
and [OAuth overview](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
support live token verification and custom scopes but do not establish the
instance-specific resource-binding proof.

## File and responsibility map

| Location                                             | Responsibility                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/backend/convex/mcp/types.ts`               | Verified internal claims/principal and stable permission types    |
| `packages/backend/convex/mcp/config.ts`              | Strict environment configuration; canonical resource and origins  |
| `packages/backend/convex/mcp/auth.ts`                | Live provider verification, active-user check, owner mapping      |
| `packages/backend/convex/mcp/transport.ts`           | Official SDK factory with stateless JSON transport                |
| `packages/backend/convex/mcp/handler.ts`             | HTTP boundary, deadlines, authorization, dispatcher integration   |
| `packages/backend/convex/mcp/tools.ts`               | Connection tool and required-scope registry                       |
| `packages/backend/convex/mcpValidators.ts`           | New table/input/return validators                                 |
| `packages/backend/convex/mcpConnections.ts`          | Atomic connection lifecycle, app APIs, internal authorization     |
| `packages/backend/convex/mcpRateLimit.ts`            | Transactional deployment/connection quota admission               |
| `packages/backend/convex/mcpDiagnostics.ts`          | Explicit safe event fields and expiring storage                   |
| `packages/backend/convex/mcpMaintenance.ts`          | Provider grant revocation, bounded cleanup, deleted-account purge |
| `packages/backend/convex/http.ts`, `crons.ts`        | Route and maintenance registration                                |
| `apps/web/src/integrations/`                         | Integrations settings and copyable client setup                   |
| `apps/web/src/routes/_app/settings.integrations.tsx` | Authenticated `/settings/integrations` route                      |
| `docs/verification/mcp-access.md`, `docs/mcp.md`     | Proofs/runtime evidence and user/operator instructions            |

Tests live alongside each owner module. Generated Convex types and the TanStack
route tree follow existing conventions. If generated changes push a task beyond
five files, split its generation/wiring checkpoint before extending the feature.

## Contracts and architecture decisions

### Provider adapter and identity

The following are internal application interfaces, not a claim about the names in
Clerk responses. Task 1 records the real provider schema; Task 4 validates it and
maps it into these types.

```ts
type McpScope = "mindspool:read" | "mindspool:labels:write";

type VerifiedMcpClaims = Readonly<{
  issuer: string;
  subject: string;
  clientId: string;
  resource: string;
  expiresAt: number; // Unix milliseconds
  scopes: readonly McpScope[];
}>;

type VerifiedMcpPrincipal = Readonly<{
  ownerId: string;
  subject: string;
  clientId: string;
  connectionId: string;
  scopes: readonly McpScope[];
}>;

type ConnectionCapabilities = {
  service: "MindSpool";
  permissions: { readLibrary: true; editItemLabels: boolean };
};
```

`verifyMcpAccessToken(request, config, signal)` returns verified claims only after
token type, active status, intended resource, expiry, allowed client, allowed
account, and active-user checks. It never creates a connection for an invalid
token. Resolve the exact existing owner inside the trusted backend; no public
function gains an `ownerId` or verified-principal argument. Provider API failures
are unavailable errors, distinct from invalid credentials. Use native server-side
`fetch`; no extra Clerk backend SDK is necessary unless the feasibility proof
demonstrates a concrete requirement and the plan is revised.

Configuration names: `MINDSPOOL_MCP_ENABLED` (default false),
`MINDSPOOL_MCP_RESOURCE_URL`, `MINDSPOOL_MCP_ALLOWED_ORIGINS`, and
`MINDSPOOL_MCP_ALLOWED_CLIENT_IDS` (exact verified IDs from Task 1). Reuse
`CLERK_JWT_ISSUER_DOMAIN`, `MINDSPOOL_ENVIRONMENT`, and
`MINDSPOOL_ALLOWED_SUBJECTS`; add server-only `CLERK_SECRET_KEY` for live provider
verification. Never expose that key in Vite configuration. The HTTP routes and
settings setup respect the enable flag; incomplete configuration fails closed.

### Connection storage and lifecycle

Add `mcpConnections` with `ownerId`, `subject`, `clientId`, `status`
(`active`/`revoked`), `allowLabelWrite`, `createdAt`, `lastUsedAt`, and optional
`revokedAt`. Index `by_owner_client` on `[ownerId, clientId]`, `by_owner` on
`[ownerId]`, and `by_subject` on `[subject]`. Do not store tokens or external
metadata URLs. Use a Convex transaction plus indexed `.unique()` lookup/insert
to prevent duplicate records under concurrent first requests; the index alone
is not a uniqueness constraint.

Public authenticated app APIs, always deriving the owner through `requireOwner`:

- `configuration({})`: `{ enabled, resourceUrl }`, with a null URL when unavailable;
  public configuration only, still behind app authentication.
- `list({ paginationOpts })`: at most ten safe connection summaries per page.
- `setLabelWrite({ connectionId, enabled })`: owner-check, active-only, idempotent.
- `disconnect({ connectionId })`: owner-check and atomically set revoked before
  scheduling any provider cleanup; repeated calls succeed without reactivation.
- `reconnect({ connectionId })`: deliberate owner action; reactivate read-only
  and clear label-write permission. OAuth verification is still required afterward.

Internal `authorize({ subject, clientId, tokenScopes })` resolves existing owner
identity, creates a missing read-only connection only with read scope, refuses
revoked connections, and returns a verified principal. Restrict effective scopes
to the intersection of token scope and app permission. Update `lastUsedAt` at
most once per minute. Do not expose this function publicly.

### HTTP and dispatch flow

`origin/host + size check → shared ingress admission → live provider verification
→ connection admission → per-connection quota → tool dispatch → safe diagnostics`.
Metadata bypasses user authorization but never exposes user data. Authenticate
GET/DELETE before returning their specified `405` responses. Accepted SDK
notifications use `202`. Reject invalid content encoding rather than decompress
an unbounded body. Read unknown-length bodies with the same 65,536-byte ceiling.

Create a fresh server and transport per request; never retain another user's
principal in module-level state. The SDK handles protocol parsing. The wrapper
handles OAuth challenges and HTTP `401/403/429/503`, including scope denial for
direct calls, rather than hiding them inside a JSON-RPC tool result. Protocol
errors and domain tool errors remain distinct as required by the spec.

`createMcpTransportHandler({ registerTools })` accepts a synchronous
`(server: McpServer) => void` registration callback and returns
`(request: Request) => Promise<Response>`. It constructs the SDK server/transport
per call. The proof uses an empty registration; production passes registration
bound to that request's verified principal. Later tools need no factory changes.
Use the SDK parser for bounded tool-call preflight before scope/quota admission;
do not build a second JSON-RPC parser or dispatcher in the wrapper.

`connectionCapabilities(principal)` produces the status tool's exact output.
`requiredScopesForTool(name)` is the closed registry used by both listing and
dispatch. A known write tool requires read and write even if the caller knows
its name and bypasses discovery. Only `mindspool_connection` ships in this module;
write authorization is tested with an injected harmless test registration.

### Quotas and retention

Use indexed `mcpRateBuckets` in Convex, not an external store. Choose UTC fixed
60-second windows: 120 request admissions and 30 write admissions per connection.
The boundary can permit a burst spanning two windows; record that behavior in
tests and documentation. Enforce request/write admissions atomically so a refused
write does not partially consume a request slot. Supply a ceiling-rounded
`Retry-After` until the next window. The initial deployment ingress ceiling is
300 verification attempts per minute, consumed before the provider call.
Reject no-bearer requests without provider calls. Never trust arbitrary forwarded
IP headers; the global ceiling limits provider amplification but is not DDoS
protection, and a hostile caller can temporarily exhaust it.

Buckets contain only scope/key/window/count/expiry fields and expire after two
minutes. Add an expiry index. `mcpDiagnostics` contains only request correlation,
optional opaque connection reference, allowlisted tool name, outcome code,
duration, and `expiresAt`; index expiry and connection reference, delete within
seven days, and never accept
arbitrary event payload objects. Store safe records instead of logging payloads
to platform logs whose retention we cannot control here.

Maintenance deletes at most 100 eligible rows per transaction and schedules a
continuation when necessary. Diagnostics become eligible 15 minutes before the
seven-day limit to allow scheduled cleanup to finish before the maximum age;
Task 11 tests that backlog continuations drain within that margin. Account purge
deletes diagnostics by connection before deleting the connection record, so it
never loses the ownership association. Revoked connection tombstones for active accounts
are never expired merely because they are old: provider refresh credentials may
outlive access tokens. After provider-confirmed account deletion, a bounded
internal cleanup can remove the connection/diagnostic records; absent users must
still fail live verification before any lazy record creation. Disabled users are
denied, with tombstones retained. A provider outage never counts as deletion.

## Dependency graph and checkpoints

```text
1 Clerk/identity proof ───┐
2 SDK factory → 3 development runtime proof ─┴→ A: feasibility review
                                               ↓
4 verified claims → 5 connection lifecycle → B: authorization review
                                               ↓
6 quotas → 7 hosted connection tool → 8 safe diagnostics → C: backend flow
                                               ↓
9 settings → 10 client setup instructions → D: usable account controls
                                               ↓
11 maintenance/revocation → 12 real-client lifecycle evidence → E: acceptance
```

The detailed checklist lives only in [todo.md](mcp-access-todo.md). Checkpoints are reviews
with the human before the next phase. Tasks 1 and 2 can be researched separately;
the remaining tasks deliberately form small connected slices. After contracts
are fixed, settings UI tests and operational documentation can progress in parallel
with diagnostics without editing shared files. This plan does not dispatch agents.

## Review focus

1. Issuer spelling, trailing slash, or wrong Clerk environment silently creates
   an empty second library: Tasks 1/4 must compare against existing owner identity.
2. Concurrent initial requests or revoke-versus-authorize races recreate a grant:
   Task 5 must prove one record and a durable revoked state under transactions.
3. Shared runtime state leaks another user's capabilities: Tasks 3/7 interleave
   read-only and write-enabled users through the real handler factory.
4. A tab from a previous account completes a late settings action after sign-out:
   Task 9 resets state and tests ownership errors without updating the new account UI.
5. A quota/provider timeout or expired access token leads a client to replay a
   future write: Tasks 7/12 distinguish unknown outcome and explicit reauthentication
   from a guarantee that a write did not occur.

## Verification and exit conditions

Focused commands and tests are specified per task. Before closing a checkpoint,
run affected backend/web tests and typechecks; run web build when UI/routes change.
At final acceptance run `pnpm check` and the existing Firefox extension build from
CI. Before invoking root Turborepo commands, read installed `turbo/docs/README.md`
and relevant task-running docs as required by `AGENTS.md`. Do not change Turbo or CI.

Both real clients must demonstrate connection, denial, read-only status, scope
upgrade with app enablement, refresh, server disconnect, provider revocation,
disabled/deleted account refusal, and reconnect. No mocks substitute for those
claims. Record redacted evidence and any limitations; never mark blocked checks done.
The existing app's library/auth behavior must still work in the development browser.

## Risks and mitigation

| Risk                                                         | Effect                                                | Mitigation/owner                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Clerk does not provide verifiable resource binding           | Cannot securely accept its tokens under this contract | Task 1 and Checkpoint A; revise architecture/spec before continuing                                                                  |
| SDK default imports pull Node-only shims                     | Convex bundle/runtime fails                           | Tasks 2/3 inspect exact pinned package, prove deployed runtime; no hidden polyfill workaround                                        |
| CIMD or default scopes differ by client/version              | Failed login or overbroad consent                     | Task 1 records metadata; Task 10 documents tested setup; Task 12 inspects actual granted scopes                                      |
| Revocation API cannot revoke every client refresh credential | Provider tokens may persist                           | Local revoked state is authoritative; document supported provider procedure and never auto-delete tombstone                          |
| Live verification adds latency or provider outages           | Requests fail or exceed budget                        | Single five-second auth deadline; fail closed with `503`; no positive auth cache                                                     |
| Global limiter becomes a contention/DoS point                | Temporary denial for legitimate traffic               | Small initial personal-library deployment; bounded indexed writes; document ceiling, inspect contention before changing architecture |
| Account deletion cleanup loses revocation evidence           | Credentials could recreate connections                | Require provider-confirmed deletion and live active-user checks; retain active-account tombstones                                    |
| Client caches tool lists after a scope change                | Stale visible capabilities                            | Enforce scope on every call; status tool reports effective permissions; document reconnect/reinitialize                              |

## Approval and handoff

Review the proposed SDK dependencies, connection/quota/diagnostic tables, client
permission workflow, and checkpoint order. The completed deploy plan and all its
checked tasks are preserved in `tasks/archive/deploy-*.md`.

After approval, execute Tasks 1–3 first and bring back evidence for Checkpoint A.
If provider access or runtime proof is blocked, finish all independent read-only
research and report the exact missing evidence; do not start dependent tasks.
Production rollout requires a later explicit authorization and deployment review.
