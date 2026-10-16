# MCP access feasibility evidence

Date: 2026-10-16. Plan: [tasks/plan.md](../../tasks/plan.md).
Worktree: `/home/martin/dev/MindSpool-mcp-spec`, branch `feature/mcp-spec`.
Baseline: `2dc0f7a`. This records Tasks 1–3 only; Checkpoint A is **blocked**.
The hosted account-access feature is not ready for use or release.

## Development provider inspection (Task 1)

Read-only requests used a local development Clerk key without printing it.
`GET /v1/instance` confirmed `environment_type: development`. No provider settings,
clients, grants, scopes, or users were changed. Convex's CLI confirmed the existing
personal development deployment `graceful-stork-346` for project `mindspool`.

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
2. Configure development-only custom scopes/read defaults, a compatible public
   client or CIMD, intended-resource audience support, and opaque tokens. DCR stays
   disabled. These settings require real consent/resource/revocation checks rather
   than relying on their presence in metadata.
3. Complete browser OAuth with a development account; compare its existing app
   owner identifier and obtain sanitized verification fixtures. Exercise a wrong
   resource, refresh, active-account refusal, and provider revocation.
4. Coordinate the development deployment, run the authenticated probe with two
   callers, record latency and errors, then disable the probe flag.

Tasks 4–12 have not started. No schema or public owner-impersonation parameters
were added. The `/mcp` endpoint, settings page, search tools, and label-editing
tools are not available from this foundation.
