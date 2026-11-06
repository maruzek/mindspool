# Deploy runbook (single-user production)

Domain: `mindspool.martinruzek.eu` (DNS on Cloudflare). Everything is deployed by hand; CI only checks. Spec: [SPEC-deploy.md](../SPEC-deploy.md). Evidence: [verification/deploy.md](verification/deploy.md).

Every command that touches production (`convex deploy`, `convex env set --prod`, `wrangler deploy`, `eas build`) needs an explicit go-ahead, and the target deployment is announced first.

## Order

1. `pnpm check` on a clean checkout of `main`.
2. **Clerk production**: create the production instance for the domain, add the DNS records it lists in Cloudflare, wait for verification. Set Access mode to **Waitlist**. Create the JWT template `convex` (audience `convex`). Allowed origins: `https://mindspool.martinruzek.eu` and `chrome-extension://<extension id>`. Sign up your own account and note its user id (`user_...`).
3. **Convex production**: set the env vars below with `pnpm --filter @mindspool/backend exec convex env set --prod NAME value`, then `pnpm --filter @mindspool/backend exec convex deploy`. Confirm `convex env list --prod` shows no `MINDSPOOL_ENABLE_DEV_SEED`.
4. **Web**: copy `apps/web/.env.production.example` to `.env.production` and fill the production values, then `pnpm --filter @mindspool/web run deploy` (builds, runs `scripts/check-bundle.mjs`, then `wrangler deploy`). Also run `node scripts/check-bundle.mjs apps/web/dist <dev convex url>` once to prove the dev deployment URL is absent.
5. **Chrome extension**: one-time key (see below), then fill `apps/extension/.env.production` and `pnpm --filter @mindspool/extension build`; run `node scripts/check-bundle.mjs apps/extension/.output/chrome-mv3 <dev convex url>`; load `.output/chrome-mv3` unpacked.
6. **Android**: set EAS env vars for the `production` environment, then `pnpm --filter @mindspool/mobile exec eas build -p android --profile production-apk`; download the APK, copy it to the phone, install.

## Environment variables (names only)

| Variable                            | System          | Where the value lives                                       |
| ----------------------------------- | --------------- | ----------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex prod     | Clerk dashboard (production Frontend API URL)               |
| `CLOUDFLARE_ACCOUNT_ID`             | Convex prod     | Cloudflare dashboard                                        |
| `CLOUDFLARE_AUTH_TOKEN`             | Convex prod     | Cloudflare scoped Workers AI token; password manager        |
| `AI_DAILY_NEURON_LIMIT`             | Convex prod     | same value as dev                                           |
| `MINDSPOOL_ALLOWED_SUBJECTS`        | Convex prod     | comma-separated Clerk user ids; unset = no restriction      |
| `MINDSPOOL_ENVIRONMENT`             | Convex prod     | `production`                                                |
| `MINDSPOOL_MCP_ENABLED`             | Convex prod     | `false` until the MCP prerequisites below pass; then `true` |
| `MINDSPOOL_MCP_RESOURCE_URL`        | Convex prod     | `https://fleet-eel-131.eu-west-1.convex.site/mcp`           |
| `MINDSPOOL_MCP_ALLOWED_CLIENT_IDS`  | Convex prod     | the two exact client metadata URLs below, comma-separated   |
| `MINDSPOOL_MCP_ALLOWED_ORIGINS`     | Convex prod     | `https://mindspool.martinruzek.eu`                          |
| `CLERK_SECRET_KEY`                  | Convex prod     | production Clerk `sk_live_` key; never a frontend variable  |
| `MINDSPOOL_ENABLE_DEV_SEED`         | Convex          | **never set in prod**                                       |
| `VITE_CLERK_PUBLISHABLE_KEY`        | web build       | `apps/web/.env.production` (gitignored); Clerk `pk_live_`   |
| `VITE_CONVEX_URL`                   | web build       | `apps/web/.env.production`; Convex prod URL                 |
| `WXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | extension build | `apps/extension/.env.production`                            |
| `WXT_PUBLIC_CLERK_FRONTEND_API`     | extension build | `apps/extension/.env.production`                            |
| `WXT_PUBLIC_CONVEX_URL`             | extension build | `apps/extension/.env.production`                            |
| `WXT_PUBLIC_WEB_URL`                | extension build | `https://mindspool.martinruzek.eu`                          |
| `CLERK_EXTENSION_PUBLIC_KEY`        | extension build | printed by `generate-key`; public, base64 DER               |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | mobile build    | EAS environment variable, environment `production`          |
| `EXPO_PUBLIC_CONVEX_URL`            | mobile build    | EAS environment variable, environment `production`          |

## Enable MCP in production

MCP code deployment and MCP activation are separate. Application deployments do
not copy development Convex variables or Clerk OAuth configuration to production.
The Integrations page reports unavailable when MCP is disabled or configuration
validation fails. Keep `MINDSPOOL_MCP_ENABLED=false` until setup is complete.

In the Clerk dashboard, select **MindSpool → Production → OAuth applications**:

1. **Scopes**: create and advertise `mindspool:read` (read saved clips, labels and
   source links) and `mindspool:labels:write` (permission reserved for label edits;
   no MCP label-editing tools exist yet).
2. **Settings**: select **Opaque access tokens**, require **PKCE**, enable the
   resource-derived **audience (`aud`) claim**, and leave refresh audience backfill
   disabled. Enable **Publish CIMD support**, set **Client admission** to
   **Pre-registered clients only**, and leave **Publish DCR support** disabled.
   Set default scopes to `mindspool:read`; Clerk adds `offline_access` itself.
3. **Applications → Add application → Pre-register CIMD client**: add each URL
   below, assign the two MindSpool scopes as its permission ceiling, and select
   **Allow client**. Both clients must be explicitly allowed and their metadata
   must load successfully. Keep the Account Portal/hosted OAuth consent available.

   - Codex: `https://chatgpt.com/oauth/codex/client.json`
   - Claude Code: `https://claude.ai/oauth/claude-code-client-metadata`

These dashboard steps follow Clerk's [OAuth settings](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
and [CIMD client management](https://clerk.com/docs/guides/configure/auth-strategies/oauth/client-id-metadata-documents)
documentation. The Backend API exposes instance OAuth settings, but its current
catalog does not expose custom-scope or CIMD pre-registration management.

If the dashboard does not expose audience settings, the documented
[Backend API schema](https://github.com/clerk/openapi-specs/blob/main/bapi/2026-08-20.yml)
supports the following instance-settings request. After creating the custom
scopes, run it with the production `CLERK_SECRET_KEY` supplied through your shell
environment. Preview with `--dry-run`, then repeat with `--yes` instead:

```sh
pnpm dlx clerk@latest api /instance/oauth_application_settings --instance prod \
  -X PATCH --dry-run -d '{"default_scopes":["mindspool:read"],"oauth_jwt_access_tokens":false,"aud_claim_enabled":true,"aud_claim_refresh_backfill_enabled":false,"pkce_required":true,"client_id_metadata_documents_advertised":true,"client_id_metadata_documents_only_allow_pre_registered_clients":true,"client_id_metadata_documents_block_implicitly_allowed_clients":true,"dynamic_oauth_client_registration":false}'
```

Set the Convex production variables from the table above. Store the production
Clerk secret using the Convex dashboard, or provide it on stdin to the CLI.
Omitting the value from the command keeps it out of shell history:

```sh
pnpm --filter @mindspool/backend exec convex env set --prod CLERK_SECRET_KEY
```

Before enabling, verify Clerk's public discovery at
`https://clerk.mindspool.martinruzek.eu/.well-known/oauth-authorization-server`
advertises both MindSpool scopes and `client_id_metadata_document_supported: true`.
Then activate:

```sh
pnpm --filter @mindspool/backend exec convex env set --prod MINDSPOOL_MCP_ENABLED true
```

No application redeploy is needed for these environment changes. Verify the
following, then connect using [the MCP client instructions](mcp.md):

- `GET https://fleet-eel-131.eu-west-1.convex.site/.well-known/oauth-protected-resource/mcp`
  returns 200, with the exact production MCP resource and Clerk issuer.
- An anonymous `POST` to `/mcp` returns 401 with an OAuth challenge. A disabled
  endpoint returns 404; invalid enabled configuration returns 503.
- Refresh Integrations: setup instructions appear. Complete browser consent with
  a client, then call `mindspool_connection` and read a saved clip. The connection
  must use the existing production library and report read-only app permissions.

To disable MCP, set `MINDSPOOL_MCP_ENABLED=false`; retain connection revocation
records. This does not revoke tokens already issued by Clerk.

## Extension key (once)

`pnpm --filter @mindspool/extension generate-key <path>.pem` writes the private key to a path **outside the repo** (store it in the password manager) and prints `CLERK_EXTENSION_PUBLIC_KEY` and the extension ID. Add `chrome-extension://<id>` to the Clerk allowed origins (dev now, production later). Reuse the same key for both so the ID never changes.

## Signing the Firefox build (Mozilla)

Once: create keys at https://addons.mozilla.org/developers/addon/api/key/, copy `apps/extension/.env.signing.example` to `apps/extension/.env.signing` (gitignored) and fill `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`. Then, after bumping the extension version:

`pnpm --filter @mindspool/extension sign:firefox` builds the Firefox zip and sources zip, submits them as an unlisted add-on, waits for Mozilla's review, and writes the signed `.xpi` to `apps/extension/.output/signed/`.

## Approving another user

1. Approve them in the Clerk dashboard (Waitlist).
2. After they sign up, copy their Clerk user id and append it to `MINDSPOOL_ALLOWED_SUBJECTS` (`convex env set --prod`). Until then they sign in but every call returns `FORBIDDEN`. Each account keeps its own separate data.

## Rollback

- Web: `wrangler rollback` in `apps/web`, or redeploy the previous commit.
- Convex: check out the previous commit and `convex deploy`.
- Android: reinstall the previous APK.

## Never

- Commit keys, tokens or `.env.*` files (only `.env.example`).
- Set `MINDSPOOL_ENABLE_DEV_SEED` in production.
- Run the seed or `recountOwnerStats` against production without asking.
- Publish to any store.
