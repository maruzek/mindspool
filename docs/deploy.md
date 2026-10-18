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

| Variable                            | System          | Where the value lives                                     |
| ----------------------------------- | --------------- | --------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex prod     | Clerk dashboard (production Frontend API URL)             |
| `CLOUDFLARE_ACCOUNT_ID`             | Convex prod     | Cloudflare dashboard                                      |
| `CLOUDFLARE_AUTH_TOKEN`             | Convex prod     | Cloudflare scoped Workers AI token; password manager      |
| `AI_DAILY_NEURON_LIMIT`             | Convex prod     | same value as dev                                         |
| `MINDSPOOL_ALLOWED_SUBJECTS`        | Convex prod     | comma-separated Clerk user ids; unset = no restriction    |
| `MINDSPOOL_ENVIRONMENT`             | Convex prod     | `production`                                              |
| `MINDSPOOL_ENABLE_DEV_SEED`         | Convex          | **never set in prod**                                     |
| `VITE_CLERK_PUBLISHABLE_KEY`        | web build       | `apps/web/.env.production` (gitignored); Clerk `pk_live_` |
| `VITE_CONVEX_URL`                   | web build       | `apps/web/.env.production`; Convex prod URL               |
| `WXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | extension build | `apps/extension/.env.production`                          |
| `WXT_PUBLIC_CLERK_FRONTEND_API`     | extension build | `apps/extension/.env.production`                          |
| `WXT_PUBLIC_CONVEX_URL`             | extension build | `apps/extension/.env.production`                          |
| `WXT_PUBLIC_WEB_URL`                | extension build | `https://mindspool.martinruzek.eu`                        |
| `CLERK_EXTENSION_PUBLIC_KEY`        | extension build | printed by `generate-key`; public, base64 DER             |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | mobile build    | EAS environment variable, environment `production`        |
| `EXPO_PUBLIC_CONVEX_URL`            | mobile build    | EAS environment variable, environment `production`        |

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
