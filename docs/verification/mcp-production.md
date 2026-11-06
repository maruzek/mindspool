# Production MCP activation

## 2026-11-06: configuration preparation

The user requested completing as much production MCP setup as available access
allows. Target: Convex `prod:fleet-eel-131`, project `martin-ruzek:mindspool`;
Clerk issuer `https://clerk.mindspool.martinruzek.eu`.

The production backend already includes the MCP routes. Initial read-only checks
found no MCP variables or `CLERK_SECRET_KEY`. Both `/mcp` and protected-resource
metadata returned 404. Clerk public OAuth discovery advertised neither MindSpool
scope nor CIMD support.

Four new production Convex variables were applied and their presence confirmed:

- `MINDSPOOL_MCP_ENABLED=false`, pending provider setup.
- `MINDSPOOL_MCP_RESOURCE_URL=https://fleet-eel-131.eu-west-1.convex.site/mcp`.
- `MINDSPOOL_MCP_ALLOWED_CLIENT_IDS` contains the exact Codex and Claude Code
  metadata URLs from the runbook.
- `MINDSPOOL_MCP_ALLOWED_ORIGINS=https://mindspool.martinruzek.eu`.

The existing production environment, issuer and account allowlist were retained.
No application deployment was needed. The disabled metadata endpoint still
returned 404 after staging, as expected.

Clerk CLI 4.1.0 reported no active login. The only local Clerk secret is a
development key. Production credential entry was requested through a private
card, which timed out without a submitted credential. No production Clerk
settings were changed and `CLERK_SECRET_KEY` remains absent from Convex.
Custom-scope creation and CIMD pre-registration are not exposed in the current
Backend API catalog and require the Clerk dashboard.

Local verification: 78 tests passed across `convex/mcp/config.test.ts`,
`convex/mcp/handler.test.ts` and `convex/mcpConnections.test.ts`. Formatting and
`git diff --check` passed for the runbook changes.

Remaining setup and activation checks are in the
[production MCP runbook](../deploy.md#enable-mcp-in-production). This staging
record does not establish successful production OAuth consent or library reads.

## 2026-11-06: production credential and OAuth settings

The user subsequently supplied the production key through a new private card.
Authenticated reads verified the production Clerk instance and primary domain
`mindspool.martinruzek.eu` before changes. The key was stored as
`CLERK_SECRET_KEY` on Convex `prod:fleet-eel-131`; a private readback comparison
confirmed it matches without printing the value.

Clerk CLI 4.1.0 previewed the settings PATCH with `--dry-run`, applied it, and
independently read back all requested values:

- `oauth_jwt_access_tokens=false` (opaque tokens).
- `aud_claim_enabled=true`; `aud_claim_refresh_backfill_enabled=false`.
- `pkce_required=true`.
- `client_id_metadata_documents_advertised=true`.
- `client_id_metadata_documents_only_allow_pre_registered_clients=true`.
- `client_id_metadata_documents_block_implicitly_allowed_clients=true`.
- `dynamic_oauth_client_registration=false`.

Public Clerk OAuth discovery now advertises CIMD support and S256 PKCE. Both
MindSpool custom scopes are still absent. Default scopes were left unchanged
because the custom read scope must first exist in the provider catalog.

Remaining dashboard actions: create and advertise both MindSpool scopes; set
default scopes to `mindspool:read`; explicitly pre-register/allow the Codex and
Claude Code CIMD URLs with those scopes. Keep the hosted consent flow available.
`MINDSPOOL_MCP_ENABLED` remains `false` until these prerequisites are complete.
Then enable it and verify the production metadata, client consent and saved
library reads using the runbook. No application code or deployment changed.

## 2026-11-06: activation

The user created and advertised both custom scopes and explicitly registered the
Codex and Claude Code CIMD clients. Screenshots showed the expected client IDs
and scope assignments. Public production discovery independently confirmed both
custom scopes and CIMD support.

The configured default scopes still included `email` and `profile`. A previewed
Clerk Backend API PATCH reduced `default_scopes` to `["mindspool:read"]`; an
independent readback confirmed the result. Clerk automatically includes
`offline_access`. The clients' explicitly assigned scope ceilings were retained.

Authorization initiation for each client, with S256 PKCE, read/offline scopes,
the exact production resource and a loopback callback, followed the same-origin
continue redirect to `accounts.mindspool.martinruzek.eu/sign-in` without an OAuth
error. These checks used a browser-style User-Agent and a cookie jar; a default
Python User-Agent received HTTP 403 before the authorization redirects.

`MINDSPOOL_MCP_ENABLED=true` was then applied to Convex `prod:fleet-eel-131`.
Live checks immediately after activation passed:

- Protected-resource metadata returned HTTP 200 with the exact production MCP
  resource, production Clerk issuer and both scopes.
- An anonymous MCP initialize POST returned HTTP 401 and a Bearer challenge
  referencing the correct protected-resource metadata and required read scope.

No application redeploy was needed. An actual production user login, completed
consent, `mindspool_connection` and authenticated saved-clip read still require
the user's client session. These checks establish activation and authorization
initiation, not the completed authenticated client lifecycle.

## 2026-11-06: direct Codex setup command

Integrations now presents `codex mcp add mindspool --url '<configured endpoint>'`
with a **Copy Codex command** button, matching the Claude Code setup flow. The
existing TOML configuration and explicit read-scope login remain under
**Manual read-only setup**. The page explains that automatic OAuth can request
advertised permissions and asks the user to review consent.

Validation: all 336 web tests passed, including direct-command clipboard checks
for development and production endpoints; web typecheck passed; React Doctor
reported 100/100 with no findings. Production build, bundle checks (including
excluding the development Convex URL), formatting and `git diff --check` passed.

Cloudflare worker `mindspool-web` was deployed to `mindspool.martinruzek.eu`,
version `e2bd8856-45f9-4a44-a7d5-44e28806ee0c`. The `cf` CLI had no saved login;
deployment used the existing authenticated Wrangler OAuth credential through the
deployment process environment. No credential was printed or copied into the
repository. The live integrations bundle is `settings.integrations-Mg9aW2u6.js`.
The browser session was signed out, so the authenticated page could not be
visually inspected; the component tests cover the setup controls.
