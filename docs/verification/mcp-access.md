# MCP access feasibility evidence

Date: 2026-10-16. Plan: [tasks/plan.md](../../tasks/plan.md).
Worktree: `/home/martin/dev/MindSpool-mcp-spec`, branch `feature/mcp-spec`.
Baseline: `2dc0f7a`. This records Tasks 1–3 only; Checkpoint A is **blocked**.
The hosted account-access feature is not ready for use or release.

## Development provider inspection (Task 1)

Initial read-only requests used a local development Clerk key without printing it.
`GET /v1/instance` confirmed `environment_type: development`. No provider settings,
clients, grants, scopes, or users were changed. Convex's CLI confirmed the existing
personal development deployment `graceful-stork-346` for project `mindspool`.
The table below records that initial snapshot; the follow-up records later setup.

| Proof                                           | Observed evidence                                                                                                                                                                      | Result                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Development Clerk instance                      | Instance API reports `development`; local key classified as a test key                                                                                                                 | Passed                                                                                           |
| PKCE S256 configuration                         | Instance `pkce_required: true`; public metadata advertises `S256`, authorization code and refresh grants                                                                               | Configuration passed; actual authorization pending                                               |
| Read-only custom scopes                         | Public `scopes_supported` contains identity/metadata scopes and `offline_access`; neither MindSpool scope is advertised. `default_scopes` and `dynamic_client_allowed_scopes` are null | Blocked: custom catalog/default/consent behavior unproved                                        |
| Client registration                             | OAuth application list has `total_count: 0`; no public-client identity available                                                                                                       | Blocked                                                                                          |
| CIMD                                            | `client_id_metadata_documents_advertised: false`; public metadata has no CIMD support flag                                                                                             | Current prerequisite absent                                                                      |
| DCR                                             | `dynamic_oauth_client_registration: false`; no registration endpoint advertised                                                                                                        | Remains disabled as planned                                                                      |
| Intended-resource validation                    | `aud_claim_enabled: false`, `aud_claim_refresh_backfill_enabled: false`                                                                                                                | Current configuration fails the prerequisite; no real token/resource mismatch proof possible yet |
| Immediate provider revocation                   | `oauth_jwt_access_tokens: true`; documented revocation endpoint cannot revoke JWT access tokens                                                                                        | Current format conflicts with the preferred opaque-token revocation proof                        |
| OAuth subject → existing library owner          | Existing `requireOwner` uses the verified app `tokenIdentifier`; existing auth tests prove issuer separation                                                                           | Live same-user mapping blocked: no OAuth grant/browser sign-in                                   |
| Active/deleted/disabled account handling        | Versioned API exposes user `banned`, `locked`, `deprovisioned` and lookup status                                                                                                       | Documented fields only; live refusal behavior unproved                                           |
| Consent, denial, refresh, revocation, reconnect | No OAuth clients or grants created                                                                                                                                                     | Blocked; no real-client success claimed                                                          |

Public discovery was read from the development Clerk issuer's
`/.well-known/oauth-authorization-server`. Configuration was read from
`GET /v1/instance/oauth_application_settings` and
`GET /v1/oauth_applications?limit=10&offset=0`.
Read-only Convex environment lookup also confirmed `MINDSPOOL_ENVIRONMENT=development`
and that `CLERK_JWT_ISSUER_DOMAIN` exactly matches that Clerk issuer. This proves
configured issuer consistency, not a real user's OAuth-to-library owner mapping.

### Development setup follow-up

After the user saved the dashboard settings, another development-only API read
confirmed opaque tokens, required PKCE, published CIMD support, and admission
restricted to pre-registered clients. DCR remains disabled. The saved defaults
still included `email` and `profile`; audience validation was still disabled.

Using the existing development test key with Clerk CLI `3.4.1`, the following
request was first previewed with `--dry-run`, then applied and independently
read back through `GET /v1/instance/oauth_application_settings`:

```json
{
  "default_scopes": ["mindspool:read"],
  "aud_claim_enabled": true
}
```

Verified current state:

- `default_scopes: ["mindspool:read"]`
- `aud_claim_enabled: true`; refresh audience backfill remains disabled
- `oauth_jwt_access_tokens: false`
- `pkce_required: true`
- `client_id_metadata_documents_advertised: true`
- Both pre-registration admission restrictions are true; DCR is false
- Public discovery advertises CIMD, token endpoint authentication `none`, and
  `authorization_response_iss_parameter_supported: true`

No users, grants, or production configuration were changed. Settings alone are
not a token/resource/refresh/revocation proof. There are still zero OAuth clients,
and public `scopes_supported` still omits both MindSpool scopes. The read scope is
accepted as an instance default; label-write scope existence and both advertising
flags need checking in the Scopes tab.

Both proposed client metadata URLs were fetched successfully with HTTP 200:

| Client      | Metadata URL                                          |
| ----------- | ----------------------------------------------------- |
| Codex       | `https://chatgpt.com/oauth/codex/client.json`         |
| Claude Code | `https://claude.ai/oauth/claude-code-client-metadata` |

Each document's `client_id` exactly equals its URL, authentication method is
`none`, grants include authorization code and refresh, and redirect URIs include
`http://127.0.0.1/callback` and `http://localhost/callback`. The stable Codex URL
applies because this Clerk instance advertises issuer-bound authorization
responses; see [official Codex registration documentation](https://learn.chatgpt.com/docs/extend/mcp#oauth-client-registration).
The Claude URL was confirmed in installed Claude Code `2.1.301` and by fetching
the actual document. Installed Codex remains `0.162.1`.

Next dashboard action: Applications → Add application → Pre-register CIMD client,
enter each URL, assign the two MindSpool scopes as the permitted scope ceiling,
and choose Allow client. This does not grant users write access: that still
requires explicit OAuth consent and the later app-side grant. The current Clerk
CLI Backend API catalog exposes ordinary OAuth application creation but no CIMD
pre-registration or scope-catalog management endpoint; no undocumented endpoints
were tried and no confidential-client fallback was substituted.

### Client registration and sign-in preparation

The user completed CIMD pre-registration and scope advertising. A fresh metadata
read now includes both `mindspool:read` and `mindspool:labels:write`. Authorization
initiation for both exact client IDs, with read/refresh scopes, S256 PKCE, a
loopback callback, and the exact development resource, returns `302` to the
development Account Portal sign-in page with no OAuth error. This is initiation
evidence, not completed consent/token evidence.

The ordinary `GET /v1/oauth_applications` list still reports zero rows. It must
not be interpreted as proof that the separate CIMD registry is empty; its count
does not establish these clients' admission or grant state.

The configured Convex site URL is
`https://graceful-stork-346.eu-west-1.convex.site`; the canonical development MCP
resource includes `/mcp` on that exact regional origin. A temporary loopback
callback is prepared in the ignored plan workspace, with a 20-minute process
lifetime. It requests read access only, validates state/issuer and S256 PKCE,
suppresses request logging, keeps credentials in memory, and writes only
explicitly redacted evidence. Its intended provider checks include verification,
existing library owner comparison, active-user status, refresh, and revocation of
the fresh test grant. The local entrypoint, exact resource/scope redirect,
`no-store`, and invalid-state refusal were exercised before presenting the page.

Browser consent and token checks are still pending. The T3 browser `status` and
`open` tools again report no connected automation host, so the user must open the
prepared local page in their own browser. No library contents are returned, no
CLI configuration is edited, and this provider-only harness does not establish
actual CLI lifecycle success or hosted Convex execution.

### Provider schema findings, not verified token fixtures

The [versioned Clerk Backend API schema](https://github.com/clerk/openapi-specs/blob/main/bapi/2026-08-20.yml)
documents `POST /oauth_applications/access_tokens/verify` returning either:

- `object: clerk_idp_oauth_access_token`, `id`, `client_id`, `subject`, `scopes`,
  optional `aud`, `revoked`, `revocation_reason`, `expired`, nullable `expiration`,
  `created_at`, and `updated_at`; or
- `{ active: false }` for an inactive JWT.

Its example timestamps for `expiration` are Unix seconds, unlike the planned
internal millisecond `expiresAt`. There is no issuer field in that response
schema. The verified instance credential and exact configured session issuer
must establish issuer identity; this still requires a real fixture and owner
comparison before Task 4. Missing `aud` cannot be replaced by a client ID.
An actor-chain `act` may also be present for exchanged tokens; no exchanged-token
acceptance is established by this proof.

The documented per-application `revoke_token` endpoint requires an opaque access
or refresh token and revokes the associated grant's tokens. It does not prove
that the backend can revoke an arbitrary owner/client grant without retaining a
token. The implementation must establish a supported grant-management procedure
or document a manual provider procedure while keeping local disconnect
authoritative. No raw tokens should be added to storage to bridge that gap.

Sources checked:

- [Clerk OAuth verification](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens)
- [Clerk OAuth behavior](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- Versioned API schema linked above; actual instance GET responses summarized in
  the table, with credentials, user data, and application identifiers omitted.

## Pinned SDK proof (Task 2)

Installed with Node `24.12.0` and pnpm `12.8.1`:

| Package                        | Exact version | Role            |
| ------------------------------ | ------------- | --------------- |
| `@modelcontextprotocol/server` | `2.3.1`       | Runtime         |
| `zod`                          | `4.6.7`       | Runtime schemas |
| `@modelcontextprotocol/client` | `2.3.1`       | Test client     |

Registry package metadata points to the official SDK repository. Server/client
tarball SHA-512 digests were compared with registry integrity fields; the registry
also supplies SLSA provenance attestations. That establishes the inspected
artifacts and available provenance, not an independent cryptographic attestation
verification. The three direct additions declare no install lifecycle scripts;
the repository's `allowBuilds` policy is unchanged. The generated lockfile pins
the graph, including SDK core `2.3.1`.

The factory creates an SDK server and Web-standard transport for every request,
uses JSON responses, disables sessions and tool-list change notifications, and
sets the request limit to 65,536 bytes. It uses the SDK's official non-codegen
`CfWorkerJsonSchemaValidator`. Accepted protocol versions are `2025-11-25`,
`2025-06-18`, and `2025-03-26`; newer optional protocol features remain disabled.

Nine tests exercise the actual handler and SDK client: initialization, notification
`202`, empty tool list, JSON/no-session responses, unsupported and newer protocol
rejection, oversized/malformed messages, and concurrent isolated registrations
with asynchronous tool completion. Test-only tools never enter HTTP production
wiring. Resources close after the complete JSON response is materialized.

## Convex proof (Task 3)

The temporary `POST /__mcp_probe` route returns `404` unless both
`MINDSPOOL_ENVIRONMENT=development` and `MINDSPOOL_MCP_PROOF_ENABLED=true`.
It checks the existing app JWT/allowed-account guard before calling an empty SDK
registry. It is not the final OAuth endpoint and returns no library data.

Ten local `convex-test` cases exercise the actual HTTP route: disabled/production
guards, anonymous `401`, disallowed-account `403`, safe auth-service failures, and
two interleaved authenticated users performing initialize/notification/list.

Convex `1.46.0` successfully bundled the application for its isolate runtime:

```sh
pnpm --filter @mindspool/backend exec convex dev --once --typecheck enable \
  --env-file /home/martin/dev/MindSpool/packages/backend/.env.local \
  --debug-bundle-path /tmp/mindspool-mcp-proof-bundle-20261016
```

The installed CLI's source confirms `--debug-bundle-path` writes the bundle and
returns before pushing deployment changes. The observed result explicitly said
“Skipping rest of push”; preparation took 4.15 seconds. The full isolate output
was about 1.6 MiB on disk. A source scan found no `node:process`, `node:http`,
`node:crypto`, `node:fs`, `new Function`, or `eval(` references in emitted JS.
This supports bundling compatibility; it is not a deployed-runtime execution proof.
`convex codegen --typecheck enable` generated the API types separately against
the same selected development deployment, without deploying the application.

No running backend was replaced and no proof flag was enabled. The worktree's
baseline predates changes on the original checkout; replacing the shared dev
backend should be coordinated with the owner of that newer work. T3 preview
`status` and `open` both explicitly reported no connected browser automation host.
There was therefore no authenticated deployed probe call and no measured hosted
request latency. These Task 3 runtime checks remain **blocked**.

## Checkpoint A and remaining work

Before Task 4:

1. Review this evidence and the pinned dependency choices.
2. Scope advertising and the user-reported CIMD registrations are prepared;
   both authorization starts reach development sign-in. Read-only defaults,
   audience support, opaque tokens, and PKCE are configured; DCR stays disabled.
   Complete real consent/resource/revocation checks rather than relying on
   settings or metadata alone.
3. Complete browser OAuth with a development account; compare its existing app
   owner identifier and obtain sanitized verification fixtures. Exercise a wrong
   resource, refresh, active-account refusal, and provider revocation.
4. Coordinate the development deployment, run the authenticated probe with two
   callers, record latency and errors, then disable the probe flag.

Tasks 4–12 have not started. No schema or public owner-impersonation parameters
were added. The `/mcp` endpoint, settings page, search tools, and label-editing
tools are not available from this foundation.

## Verification of the foundation

| Check                                              | Result                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                   | Passed; existing install-script policy retained                                                            |
| `pnpm check`                                       | Passed: repository formatting, 866 tests, all workspace typechecks and web/extension/Android export builds |
| MCP tests included above                           | 19 passed: nine transport and ten guarded HTTP-probe cases                                                 |
| `pnpm --filter @mindspool/extension build:firefox` | Passed                                                                                                     |
| Convex isolate bundle and generated types          | Passed; no application deployment performed                                                                |
| Fresh independent review                           | No findings within Tasks 1–3; installed SDK source and focused tests checked                               |
| Real hosted runtime and both CLI OAuth lifecycles  | Not verified; blockers above remain open                                                                   |

Web tests emitted jsdom `scrollTo` notices while passing. No tests were skipped,
removed, or weakened for this change. The original checkout's Git working tree
remains clean. Implementation commits are `c195cce` (transport), `2baf6e5`
(provider evidence), and `97601d4` (guarded probe); plan status and this final
verification are recorded separately.
