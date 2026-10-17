# MindSpool MCP access

Feasibility and the authorization implementation are complete; the authorization
checkpoint is ready for review. There is no usable `/mcp` endpoint
yet. The current module is account connection and permissions; clip discovery
and label-editing tools belong to subsequent modules.

The approved contract is in [SPEC-mcp-access.md](../SPEC-mcp-access.md), the
implementation sequence is in [the access plan](../tasks/archive/mcp-access-plan.md), and observed
results and blockers are in [the feasibility record](verification/mcp-access.md).

## Development prerequisites

The first implementation gate requires a development Clerk instance that can
issue verifiable, resource-bound OAuth tokens for public CLI clients. It must
provide `mindspool:read`, default read-only consent, and separately approved
`mindspool:labels:write`. Intended audience, user status, refresh and immediate
provider revocation must be demonstrated with actual tokens. Do not substitute
an app session JWT or client ID for the OAuth resource proof.

The development instance now has opaque access tokens, required PKCE, published
CIMD with pre-registration restrictions, audience validation enabled, and a
`mindspool:read` default. Both custom scopes now appear in public discovery, and
the user has pre-registered both CIMD clients. Authorization initiation with each
client reaches the development sign-in page. Both browser OAuth proofs and the real second-resource negative check have passed. Production configuration and
deployment require separate authorization.

In the development dashboard's OAuth applications → Applications tab, choose
Add application → Pre-register CIMD client for each verified URL:

- Codex: `https://chatgpt.com/oauth/codex/client.json`
- Claude Code: `https://claude.ai/oauth/claude-code-client-metadata`

Permit `mindspool:read` and `mindspool:labels:write` for each client, then choose
Allow client. These are allowed scopes, not a user grant; keep the instance default
read-only. In the Scopes tab, also enable metadata advertising for both custom
scopes. Real authorization still needs an explicit consent/resource-binding proof.

The actual development resource URL is
`https://graceful-stork-346.eu-west-1.convex.site/mcp`; preserve the regional
hostname when issuing tokens and checking audiences. A temporary local provider
proof page requests only `mindspool:read offline_access`, validates PKCE and the
issuer-bound callback, and keeps credentials in process memory. It checks live
token verification, owner mapping against existing owner statistics, refresh,
and revocation of its freshly approved test grant. This is a provider proof,
not a claim that either CLI has connected to the unfinished `/mcp` endpoint.
Both provider flows have passed read-only consent, exact audience and existing
owner mapping, active-user lookup, refresh, and immediate test-grant revocation.
The hosted Convex SDK probe has also passed, including exact identity comparison
through the existing web-auth query. A real token issued for a different resource was rejected before user/library lookup,
and its test grant was revoked.
Actual CLI MCP lifecycles and inactive-account refusal tests remain separate checks.

## Temporary runtime probe

`POST /__mcp_probe` is only a transport/runtime check. It is unavailable unless
the selected backend has both `MINDSPOOL_ENVIRONMENT=development` and
`MINDSPOOL_MCP_PROOF_ENABLED=true`. It requires the existing app JWT and approved
account, registers no tools, returns no library data, and allocates no session.
It does not establish OAuth compatibility.

The probe was exercised on the development deployment with two existing browser
sessions of the same owner; initialize/notification/list responses completed in
186–248 ms. Its enable flag was removed afterward, restoring `404`. Local route
tests additionally exercise distinct users and the allowed-account guard.

Keep the probe disabled except during the coordinated development check, and
disable its flag after testing. The plan removes its route when the real endpoint
is wired. No public setup commands should point clients at this probe.

The transport and route tests run locally without provider credentials:

```sh
pnpm --filter @mindspool/backend exec vitest run convex/mcp/transport.test.ts convex/mcp/proof.test.ts
pnpm --filter @mindspool/backend typecheck
```

## Eventual client setup

Codex and Claude Code setup instructions will be added only after their browser
OAuth flows have been exercised against the actual development endpoint. Users
will not copy bearer secrets. Read-only access shares saved content with the
connected client. Label editing will require both app-side enablement and OAuth
write consent; the initial connection module exposes only a status tool.

Connections are per account and OAuth client, potentially across multiple
installations. Web sign-out will not disconnect delegated clients. Server-side
disconnect must block subsequent requests even when the client retains old
credentials; it cannot erase content already returned to that client.
