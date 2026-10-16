# MindSpool MCP access

Implementation is at the feasibility stage. There is no usable `/mcp` endpoint
yet. The current module is account connection and permissions; clip discovery
and label-editing tools belong to subsequent modules.

The approved contract is in [SPEC-mcp-access.md](../SPEC-mcp-access.md), the
implementation sequence is in [tasks/plan.md](../tasks/plan.md), and observed
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
`mindspool:read` default. No OAuth clients have been registered yet, and the two
custom scopes are not advertised in public discovery. Finish scope advertising
and CIMD registration, then complete the browser OAuth proof before implementing
the authorization layer. Production configuration and deployment require separate
authorization.

In the development dashboard's OAuth applications → Applications tab, choose
Add application → Pre-register CIMD client for each verified URL:

- Codex: `https://chatgpt.com/oauth/codex/client.json`
- Claude Code: `https://claude.ai/oauth/claude-code-client-metadata`

Permit `mindspool:read` and `mindspool:labels:write` for each client, then choose
Allow client. These are allowed scopes, not a user grant; keep the instance default
read-only. In the Scopes tab, also enable metadata advertising for both custom
scopes. Real authorization still needs an explicit consent/resource-binding proof.

## Temporary runtime probe

`POST /__mcp_probe` is only a transport/runtime check. It is unavailable unless
the selected backend has both `MINDSPOOL_ENVIRONMENT=development` and
`MINDSPOOL_MCP_PROOF_ENABLED=true`. It requires the existing app JWT and approved
account, registers no tools, returns no library data, and allocates no session.
It does not establish OAuth compatibility.

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
