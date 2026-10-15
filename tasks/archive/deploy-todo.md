# Tasks: Production deploy

Source: [SPEC-deploy.md](../SPEC-deploy.md). Plan: [plan.md](plan.md). Commands run from the repository root. Tasks marked **prod** touch production systems and need your explicit go-ahead before each command; tasks marked **manual** need you (browser, phone, dashboards). Do not mark them done without evidence in `docs/verification/deploy.md`.

## Phase 1: Code and early testing (no production touched)

- [x] **Task 1: Access guard in `requireOwner`**
  - Acceptance: `MINDSPOOL_ALLOWED_SUBJECTS` (comma-separated, trimmed) is enforced in `requireOwner`; allowed id passes; other id throws `FORBIDDEN`; unset or empty passes; unauthenticated still `UNAUTHENTICATED`. Every other place reading the identity directly is routed through the guard or documented as internal-only.
  - Verify: `pnpm --filter @mindspool/backend test` (new cases in `auth.test.ts`, plus a test that exercises public queries/mutations as a refused user); `pnpm --filter @mindspool/backend typecheck`.
  - Files: `packages/backend/convex/auth.ts`, `auth.test.ts`, `processingRuns.ts` (if audit requires), maybe `identity.ts`.

- [x] **Task 2: Web on Workers, build guard** — M
  - Acceptance: `wrangler` added to `apps/web`; `wrangler.jsonc` with assets `./dist`, SPA fallback, route `mindspool.martinruzek.eu` as custom domain; `deploy` script (build then `wrangler deploy`); `scripts/check-bundle.mjs` (repo root) fails on `pk_test_`, `localhost`, `127.0.0.1` and any forbidden string passed by argument in a built directory; `.env.production.example` documented.
  - Verify: `pnpm --filter @mindspool/web build`; `pnpm --filter @mindspool/web exec wrangler dev` serves the SPA and a deep link (e.g. `/library`) falls back to `index.html`; the check script passes on a prod-style build and fails on a dev build (test both).
  - Files: `apps/web/wrangler.jsonc`, `apps/web/package.json`, `apps/web/.env.production.example`, `scripts/check-bundle.mjs`, `.gitignore` (verify `.env.*` already covers it).

- [x] **Task 3: Chrome extension against the dev stack (fail fast)** — manual
  - Acceptance: a script or documented command generates the extension key pair (private key kept outside git), prints `CLERK_EXTENSION_PUBLIC_KEY` and the derived extension ID; `build` (Chrome MV3) succeeds and loads unpacked with that stable ID; the 7-step walkthrough from the spec passes against the **dev** Clerk and Convex (add the ID to the dev Clerk allowed origins); every defect found is fixed with a test where practical.
  - Verify: `pnpm --filter @mindspool/extension test`; `pnpm --filter @mindspool/extension build`; walkthrough results in `docs/verification/deploy.md` (Chrome section) with the console clean.
  - Files: `apps/extension/scripts/generate-key.mjs`, `apps/extension/package.json`, `apps/extension/wxt.config.ts`, `apps/extension/.env.example`, fixes as found.
  - Note: may exceed five files if fixes are needed; split fixes into follow-up tasks (3a, 3b).

- [x] **Task 4: EAS production-apk profile**
  - Acceptance: `eas.json` has `production-apk` (APK, `environment: production`, internal distribution, no store submit profile); `apps/mobile/.env.example` notes that prod values come from EAS environment variables, not committed files; no `submit` section.
  - Verify: `pnpm --filter @mindspool/mobile typecheck`; `pnpm --filter @mindspool/mobile test`; `pnpm --filter @mindspool/mobile exec expo config --type public` still resolves.
  - Files: `apps/mobile/eas.json`, `apps/mobile/.env.example`.

- [x] **Task 5: Runbook and verification doc skeleton**
  - Acceptance: `docs/deploy.md` has the ordered steps, env-var table per system (names only, where each value lives), the two-step approve-a-user procedure, rollback, and the "never" list; `docs/verification/deploy.md` has empty result tables for each success criterion.
  - Verify: `pnpm format:check`; every env var in the code (`grep process.env`, `import.meta.env`) appears in the table.
  - Files: `docs/deploy.md`, `docs/verification/deploy.md`.

**Checkpoint A:** `pnpm check` green; Chrome walkthrough passes on dev; `wrangler dev` serves the SPA. Review with the user before touching production.

## Phase 2: Production (each step needs your go-ahead)

- [x] **Task 6: Clerk production instance and DNS** — manual
  - Acceptance: production instance for `mindspool.martinruzek.eu` with DNS records added in Cloudflare and verified; Access mode **Waitlist**; JWT template `convex` (audience `convex`); allowed origins include `https://mindspool.martinruzek.eu` and the extension origin; your own account created in production; publishable key and issuer domain recorded in your password manager.
  - Verify: Clerk dashboard shows the instance verified; the production sign-in page loads on the domain once Task 8 is done; clerk CLI `clerk doctor`/deploy verify if available.
  - Files: none in git (runbook notes only).

- [x] **Task 7: Convex production deployment** — prod
  - Acceptance: prod deployment created; env set: `CLERK_JWT_ISSUER_DOMAIN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN` (scoped Workers AI token), `AI_DAILY_NEURON_LIMIT` (dev value), `MINDSPOOL_ALLOWED_SUBJECTS` (your prod Clerk id), `MINDSPOOL_ENVIRONMENT=production`; `MINDSPOOL_ENABLE_DEV_SEED` unset; functions deployed from a clean checkout of `main`.
  - Verify: `convex env list --prod` (names reviewed, secrets not printed into the doc); `convex deploy` output; deployment announced and confirmed before the command runs (deploy guard).
  - Files: none (runbook updated if steps changed).

- [x] **Task 8: Web deploy on `mindspool.martinruzek.eu`** — prod
  - Acceptance: build with prod `VITE_*`; `check-bundle` passes; `wrangler deploy` succeeds; the domain loads over HTTPS; you can sign in and see an empty Library; a second Clerk account on the waitlist cannot sign up; if created manually and not in the allowed list, the app shows an access error and Convex returns `FORBIDDEN`.
  - Verify: results in `docs/verification/deploy.md`; manual sign-in; second-account test.
  - Files: `docs/verification/deploy.md`.

- [x] **Task 9: Chrome extension on production** — manual
  - Acceptance: build with prod `WXT_PUBLIC_*` and the stable key; `check-bundle` passes (no dev values); the Chrome ID is in the prod Clerk allowed origins; the 7-step walkthrough passes against production; clipped items appear on the live site.
  - Verify: walkthrough table filled with evidence.
  - Files: `docs/verification/deploy.md`.

- [x] **Task 10: Android APK on production** — manual, prod
  - Acceptance: EAS environment variables set for `production` (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CONVEX_URL`); `eas build -p android --profile production-apk` succeeds within the free plan; APK installed on your phone by file; sign-in persists after killing the app; sharing an X link saves one item visible on the web within seconds, re-share shows "Already saved", Library list shows live labels. This also closes the open device checks from the archived Android plan.
  - Verify: results in `docs/verification/deploy.md`; EAS build page shows the plan usage.
  - Files: `docs/verification/deploy.md`.

- [x] **Task 11: Clef in prod and close-out**
  - Acceptance: a saved item in prod receives Clef labels; the daily limit is respected (verify with a low temporary limit only if you agree); `README.md` and `CAPABILITIES.md` describe the deployed setup; `docs/deploy.md` matches what was actually done; `pnpm check` green; spec's Success Criteria all ticked or noted.
  - Verify: `pnpm check`; labels visible on the live site.
  - Files: `README.md`, `CAPABILITIES.md`, `docs/deploy.md`, `docs/verification/deploy.md`.

**Checkpoint B (complete):** every Success Criterion in `SPEC-deploy.md` has evidence. Review with the user.
