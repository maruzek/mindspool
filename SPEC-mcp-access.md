# Spec: Hosted MCP account access

Module: `mcp-access` in [CAPABILITY-MAP-mcp.md](CAPABILITY-MAP-mcp.md).
Status: approved for planning by the user's “write the plan” instruction.
Implementation is in progress: feasibility and Tasks 1–5 are complete; the
endpoint and remaining controls are tracked in [the access implementation
plan](tasks/archive/mcp-access-plan.md). There is no usable `/mcp` endpoint yet.

## Objective

Connect Codex and Claude Code to the user's existing private MindSpool account
through a hosted MCP endpoint. The user signs in through their browser, grants
read access or read access with label editing, and can later disconnect a client
from MindSpool.

This module provides connection, authorization, connection management, and the
shared contract for subsequent discovery and label-editing tools. Finding clips
belongs to `mcp-discovery`; editing item memberships belongs to `mcp-labels`.

### Assumptions and decisions

- Confirmed: hosted endpoint, existing MindSpool account, Codex and Claude Code.
- Proposed: use the existing Convex deployment for the HTTP endpoint and the
  existing Clerk instance as the OAuth authorization server.
- Proposed: read-only is the default; label editing requires a separate grant.
- Proposed: use Clerk's hosted sign-in and consent pages. A MindSpool settings
  page provides setup instructions, connection status, and disconnect controls.
- Proposed: target the CLI clients first. No marketplace listing, plugin bundle,
  local bridge, additional AI service, or client configuration edits by the app.
- Existing library ownership and allowed-account restrictions remain binding.

These proposals require spec approval. Provider configuration, new dependencies,
schema changes, and production actions are not performed by this document.

## Tech stack and evidence

Repository baseline: `53678473a2e81e760a904b8b7b8d42e1fda46819` from main.
Existing versions: Convex 1.46.0, TypeScript 6.0.3, React 19.2.3,
`@clerk/react` 6.17.5, Vitest 5.0.3, and `convex-test` 0.0.60.
Use the repository's pnpm 12.8.1 and Node >=24.12.0 requirements.

Current documentation checked for this draft:

- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) documents
  Streamable HTTP, OAuth, CIMD, DCR, and OAuth login commands.
- [Claude Code MCP](https://code.claude.com/docs/en/mcp) documents HTTP transport,
  browser authentication, CIMD, preconfigured OAuth clients, and scope settings.
- [Clerk OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
  documents custom scopes, PKCE, consent, CIMD, and opaque tokens for immediate
  revocation. These instance features must be verified in development; the
  frontend SDK version alone does not establish their availability.
- [Clerk token verification](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens)
  documents server verification through its backend API or SDK. Do not assume
  an OAuth access token works as the app's existing Convex session JWT.
- [Convex HTTP actions](https://docs.convex.dev/functions/http-actions) expose
  HTTP routes on the deployment's `.convex.site` origin. Installed 1.46.0 types
  also provide HTTP actions and internal query/mutation calls.

Use the official MCP TypeScript SDK for protocol handling, with a transport
compatible with Convex's Request/Response runtime. Its exact package version and
dependencies must be pinned and demonstrated during planning, before coding the
feature. Do not introduce a handwritten JSON-RPC implementation.

## User experience

1. Open MindSpool's Integrations settings while signed in. See the endpoint URL,
   setup instructions for both clients, and permission descriptions.
2. Add MindSpool in the client, then start authentication. The browser shows the
   account and client being connected and the requested permissions.
3. Approve read-only access. To edit labels, enable that permission in MindSpool
   settings, then request and approve the OAuth write scope in the client.
   Denying or cancelling grants no library access.
4. The client can call `mindspool_connection` to verify its granted capabilities.
5. Settings lists connected clients and their access. Disconnecting a client
   blocks its future requests, including requests made with old credentials.
6. Reconnecting a disconnected client requires an explicit action in the signed-in
   app and valid OAuth authorization. Simply retrying an old token cannot restore
   a revoked connection.

The UI explains that returned clips are shared with the connected agent/client,
that reading does not permit editing, and that disconnect cannot erase content
already returned to a client. Connection-management controls are available only
in the signed-in app, not as agent-callable tools.

## Hosted protocol contract

Canonical resource: `https://<deployment>.convex.site/mcp`, configured separately
for development and production. A vanity domain is optional future work.

| Route                                           | Access               | Contract                                                                    |
| ----------------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `POST /mcp`                                     | Bearer authorization | MCP initialization, notifications, tool listing, and calls                  |
| `GET /mcp`                                      | Bearer authorization | `405` because v1 offers no standalone SSE stream                            |
| `DELETE /mcp`                                   | Bearer authorization | `405`; no transport session is allocated                                    |
| `GET /.well-known/oauth-protected-resource/mcp` | Public               | Canonical resource, configured Clerk authorization server, supported scopes |
| `GET /.well-known/oauth-protected-resource`     | Public               | Same metadata for clients using root discovery                              |
| Metadata `OPTIONS`                              | Public               | Bounded, explicitly configured CORS preflight response                      |

Use stateless Streamable HTTP with JSON responses, protocol negotiation, and no
in-memory user or session state shared between requests. Handle accepted
notifications with `202`; reject unsupported protocol versions and malformed
messages. Do not offer legacy HTTP+SSE, sampling, shell execution, or unsolicited
server requests. These choices follow the
[MCP transport contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

For missing or invalid credentials, return HTTP `401` with a Bearer
`WWW-Authenticate` challenge pointing to the resource metadata. Invalid Origin
headers receive `403`; desktop CLI requests with no Origin are permitted if
otherwise authorized. Metadata is public, contains no user data, and is never
redirected to the SPA's login screen.

OAuth uses authorization code flow with PKCE S256, the canonical resource, and
consent. Prefer CIMD supported by the target clients; do not enable DCR merely
to make a failing login pass. Pre-registered public clients are an acceptable
documented fallback if CIMD fails the compatibility checks. No shared client
secret is distributed to desktop clients. Implement metadata and token audience
checks according to the
[MCP authorization contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Permission and identity contract

| Scope                    | Meaning                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `mindspool:read`         | Read owned clips, saved content, labels, and connection capabilities |
| `mindspool:labels:write` | Add/remove existing labels on owned items; requires read access too  |

Expose these scopes with plain-language descriptions in consent. Omitted scope
requests default to read-only. Advertise read as the initial required scope;
do not make connecting automatically request every supported permission.
`offline_access` may be requested for refresh; identity scopes are included only
as required by the provider. No profile, email, or metadata permission is needed
for library access. Effective permissions are the intersection of verified token
scopes, the active MindSpool connection's approved scopes, and the tool's needs.

Every protected request must:

- Verify the token through the configured Clerk instance, including its active
  status, expiry, user subject, client identity, and intended resource. Reject
  session tokens, ID tokens, machine credentials, and tokens for another resource.
- Resolve that verified subject to the same `ownerId` as the app's existing
  `requireOwner`/Convex `tokenIdentifier`. Never use email as identity, accept an
  owner from MCP arguments, or silently create a second library under a new issuer.
- Enforce `MINDSPOOL_ALLOWED_SUBJECTS`, active connection state, and required
  scopes before dispatch. Disabled/deleted accounts must not retain delegated
  access. Subsequent modules must also check document ownership.

OAuth tokens can be opaque. Prefer live verification for each request and no
positive authorization cache in v1. If identity is bridged to internal Convex
operations, only the verified server handler may construct the principal;
public library functions must not acquire owner-impersonation arguments. Keep
the app's JWT auth provider intact. Do not forward an MCP token to another API
as a substitute for that API's credentials.

### Revocation and connection records

Maintain an owner-scoped connection record keyed by verified OAuth client identity,
with approved scopes, created/last-used timestamps, and active/revoked state.
An initial verified authorization may create a read-only active record; write
permission in that record requires an authenticated settings action. A previously
revoked record must never be automatically reactivated. Reducing the app-side
permission takes effect even if an old token still carries write scope. The exact
schema and atomic creation rules belong in the implementation plan.

Disconnect is idempotent, affects only the current user's selected client, and
blocks every request whose authorization check starts after disconnect completes.
An already executing mutation may finish; the app must not promise cancellation.
Provider-side revocation must also invalidate access. Revoke refresh credentials
where supported; local connection state must still reject subsequently refreshed
tokens. Do not describe clearing credentials in a CLI as proof of server revocation.

Connections are per account and OAuth client, not guaranteed per device. If a
client identity is shared by installations, label disconnect as applying to all
those installations. Neither a client display name nor an MCP session ID proves
identity. Signing out of the web app alone does not revoke delegated access.

## Shared module interface and errors

The verified principal is internal server data and is never serialized into a
tool result. Illustrative TypeScript contract using repository style:

```ts
type McpScope = "mindspool:read" | "mindspool:labels:write";

type VerifiedMcpPrincipal = Readonly<{
  ownerId: string;
  subject: string;
  clientId: string;
  connectionId: string;
  scopes: readonly McpScope[];
}>;
```

`mindspool_connection` accepts exactly `{}` and returns
`{ service: "MindSpool", permissions: { readLibrary: true, editItemLabels: boolean } }`.
It requires read access, is read-only and idempotent, and returns neither tokens
nor account identifiers. Discovery and label tools register with an explicit
required-scope declaration. The dispatcher enforces it even for a direct call to
a tool omitted from a read-only client's listing. Tool annotations do not grant
permission; do not advertise tool-list change notifications in this stateless v1.

Tool schemas validate inputs and outputs. Tool results carry structured content
plus the equivalent serialized text for client compatibility, following
[MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

| Condition                                           | Representation                                                  |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Missing/invalid/revoked provider token              | HTTP `401`, OAuth challenge                                     |
| Missing scope                                       | HTTP `403`, Bearer `insufficient_scope` and required scope      |
| Disallowed account or revoked local connection      | HTTP `403`; no tool execution                                   |
| Rate limit                                          | HTTP `429` and `Retry-After`                                    |
| Authentication service unavailable                  | HTTP `503`; fail closed, do not mislabel as invalid credentials |
| Malformed JSON-RPC, unknown tool, invalid arguments | SDK protocol errors; no stack traces                            |
| Missing, malformed, deleted, or foreign item/label  | Tool error `NOT_FOUND`, identical public message                |
| Other tool/domain failure                           | `isError: true` with `{ error: { code, message, retryable } }`  |

Domain error codes shared with later modules: `INVALID_INPUT`, `NOT_FOUND`,
`CONFLICT`, `UNAVAILABLE`, `INTERNAL_ERROR`. Do not retry writes automatically
unless the particular tool's contract proves that retry safe. Transport timeouts
do not prove a write failed.

## Limits, secrets, and diagnostics

- Limit decoded request bodies to 64 KiB. Initial limits: 120 protected requests
  per minute per connection, including at most 30 write calls, with a shared
  deployment-level limiter rather than per-process counters. The plan must
  select the store and ingress limit for unauthenticated verification traffic.
- Target a 15-second overall request budget with a shorter authentication
  timeout. Recheck provider and connection authorization on subsequent requests.
- Keep provider secret keys server-side only. Do not persist raw access or
  refresh tokens in connection records, browser storage, or tool responses.
- Log request correlation, tool name, outcome code, latency, and opaque connection
  reference. Redact credentials and authorization headers; omit clip text, search
  text, titles, URLs, and email. Retain this diagnostic data for at most seven days.
- Keep connection metadata for access management; remove it with account data.
  Preserve a revocation tombstone while credentials could still be valid so cleanup
  cannot reactivate access. Never include secrets in the settings page or examples.

## Commands

Existing repository commands, run from the isolated checkout after normal setup:

```sh
pnpm dev:web
pnpm dev:backend
pnpm --filter @mindspool/backend test
pnpm --filter @mindspool/backend typecheck
pnpm --filter @mindspool/web test
pnpm --filter @mindspool/web typecheck
pnpm --filter @mindspool/web build
pnpm exec prettier --check CAPABILITY-MAP-mcp.md SPEC-mcp-access.md
```

Development servers and Convex CLI actions require a classified development
target. No backend command or production configuration change was run for this
spec. Future transport checks must use the implemented handler and real clients;
a new package or script must be added to these commands when actually chosen.

Example client setup after an endpoint exists; substitute its development URL:

```sh
codex mcp add mindspool --url https://YOUR-DEV-DEPLOYMENT.convex.site/mcp
codex mcp login mindspool --scopes mindspool:read
codex mcp list

claude mcp add --transport http --scope user mindspool https://YOUR-DEV-DEPLOYMENT.convex.site/mcp
claude mcp get mindspool
```

For Claude Code, open `/mcp` in a session and authenticate. `--scope user` above
controls configuration location, not OAuth permissions. The read-only challenge
and provider defaults must result in read-only consent. Document an explicit
write-scope setup for each client during implementation, then verify the granted
permissions using `mindspool_connection`. CLI help was inspected for local Codex
0.162.1 and Claude Code 2.1.300; an OAuth connection was not attempted.

## Project structure and code style

Use the existing layout; these are proposed ownership locations, not new files
to implement in this phase:

```text
packages/backend/convex/http.ts           HTTP route registration
packages/backend/convex/mcp/              Transport, verification, dispatch, tests
packages/backend/convex/mcpConnections.ts Connection management, internal operations
packages/backend/convex/auth.ts           Existing ownership rules to preserve
apps/web/src/integrations/                Settings content and component tests
apps/web/src/routes/                      Integration settings route
docs/verification/mcp-access.md           Client versions and runtime evidence
```

Follow existing ESM TypeScript, double quotes, semicolons, repository Prettier,
and colocated `*.test.ts`/`*.test.tsx`. Convex functions use explicit validators.
Keep transport/provider details at the boundary; later tools receive only a
verified principal and validated arguments.

## Testing strategy

- Vitest: permission intersection, strict token-verification response parsing,
  expiry/resource/client rejection, timeouts, generic errors, and log redaction.
- `convex-test`: two users with existing clips; MCP identity resolves to the same
  owner as web identity; foreign records stay inaccessible; connection creation,
  revocation, reactivation, and concurrency preserve ownership and approved scopes.
- HTTP contract tests through the real protocol handler: initialize, notification,
  tool listing/call, metadata discovery, authentication challenges, invalid origins,
  unsupported versions/methods, request limits, and rate-limit responses.
- Settings component tests: loading/empty/error states, permission descriptions,
  disconnect/reconnect, keyboard operation, and accessible control names.
- Real development deployment: complete sign-in, denial, read-only connection,
  write permission upgrade, refresh, app disconnect, provider revocation, and
  reconnect in both CLI clients. Record versions, URLs without secrets, and results.
- Access tests use a harmless test tool to prove write gating. Actual clip search
  and label mutation are verified by their modules; this one must not claim them.

No arbitrary percentage coverage target. Every authorization refusal and lifecycle
transition above needs an executable assertion; real OAuth behavior requires
runtime evidence in addition to mocks.

## Boundaries

- Always: derive identity server-side, enforce scopes and document ownership,
  preserve existing browser/extension/mobile auth, bound reads and requests,
  validate provider responses, and record real-client verification before release.
- Ask first: approve this spec before planning; approve concrete dependency/schema
  choices in the plan; obtain explicit consent before changing production Clerk,
  Convex, DNS, or deployment configuration. DCR or a separate hosting service
  requires revisiting the proposal.
- Never: commit credentials, expose an arbitrary Convex-function executor, accept
  client-supplied ownership, bypass account restrictions, silently broaden scopes,
  treat clip instructions as user consent, or weaken tests to pass integration.

## Success criteria

1. Both target CLI clients connect to the same development endpoint through
   browser OAuth and call `mindspool_connection` without copied bearer secrets.
2. The connected account maps to its existing library, proven against web-auth
   fixtures; another account's identity, connections, and documents are inaccessible.
3. Read-only credentials cannot execute a write through any MCP dispatch path.
   An explicit approved scope upgrade enables writes without adding other powers.
4. Disconnect blocks subsequent authorization checks, including refreshed tokens;
   reconnect requires deliberate app action. Provider-revoked tokens are rejected.
5. Discovery, malformed requests, origin checks, limits, and provider failures
   satisfy the HTTP contract without leaking sensitive data.
6. Existing app auth tests still pass. Required backend/web checks above pass;
   runtime evidence covers both clients and lists any unverified cases honestly.

## Open questions and required proofs

These are technical questions to resolve before approving an implementation plan,
not reasons to substitute a weaker authorization model:

1. Does this Clerk instance expose custom scopes and CIMD with appropriate
   client restrictions? Verify dev availability and any plan/configuration cost.
2. Can its verified tokens demonstrably bind to this MCP resource and expose the
   necessary user/client identity? The consulted Clerk overview does not establish
   resource/audience binding. If not, revise this spec; do not omit the check.
3. Prove the OAuth-to-existing-Convex-owner mapping using real verified claims
   and an existing account. Define internal adapters without making ownership
   impersonation public or copying the external token through to Convex auth.
4. Prove the selected official SDK transport works in Convex 1.46.0's HTTP runtime
   and meets the request budget. If it needs another host, return with a concrete
   revision before adding infrastructure.
5. Select the shared limiter, connection schema, provider revocation procedure,
   and bounded handling of disabled/deleted Clerk users. Tests must establish
   active-user enforcement rather than assuming token expiry handles deletion.

## Review gate

Approve or revise the hosted connection, read-only default, optional label-write
permission, and in-app disconnect behavior. Approval validates these requirements;
it does not authorize production changes. Stop here before planning, task lists,
implementation, or the next module spec.
