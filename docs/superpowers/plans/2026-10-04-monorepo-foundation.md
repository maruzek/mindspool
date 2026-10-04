# Monorepo Foundation Implementation Plan

> **For agentic workers:** Implement the authorized repository foundation inline, task by task. No publishing or external account creation is included.

**Goal:** Prepare an installable pnpm/Turborepo workspace with web, mobile, extension, and shared packages, using Clerk for authentication.

**Architecture:** Apps live in `apps/*`; shared packages live in `packages/*`. App bundlers consume shared TypeScript source directly. Convex is the single backend; Clerk supplies identity.

**Tech Stack:** pnpm, Turborepo, TypeScript, React/Vite, Expo, WXT, Convex, Clerk, Prettier.

**Spec:** `README.md` and the user's requests to prepare the monorepo, use pnpm throughout, and use Clerk for auth.

## Global Constraints

- Preserve installed skills and project notes.
- Keep all workspace packages private; internal dependencies use `workspace:*`.
- Use pnpm for installation, generators, CLI commands, and documented workflows.
- Use Expo-compatible React/React Native versions and current Clerk packages.
- Ignore credentials, generated output, caches, and native build directories.
- Prepare provider configuration locally; external accounts, deployments, and real sign-in require instance configuration.
- Product data models and Jev/Clef calls belong to subsequent roadmap work.

## Review Focus

- Clean installs resolve internal imports without undeclared hoisted dependencies.
- Expo resolves shared source and uses compatible native dependencies.
- Extension permissions stay scoped to configured Clerk hosts.
- Build/typecheck/format checks work without credentials.
- Missing credentials show setup guidance, never imply authentication succeeded.

### Task 1: Root Tooling and Shared Packages

**Files:** Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, Prettier configuration, `.node-version`; package manifests and source/config files in `packages/{schema,ui,typescript-config,backend}`.

**Interfaces:** Root dev/build/typecheck/format commands; strict TypeScript presets; shared provider identifier types; reusable DOM presentation; backend initialization commands.

- [x] Configure `apps/*` and `packages/*` workspace patterns.
- [x] Pin the package manager and resolve dependencies through pnpm.
- [x] Configure Turbo dependency ordering for build/typecheck and persistent uncached dev tasks.
- [x] Configure shared packages with explicit source exports and `workspace:*` dependencies.
- [x] Verify workspace discovery with `pnpm exec turbo ls`.

### Task 2: App Shells and Clerk Preparation

**Files:** Vite config and React entrypoints in `apps/web`; Expo app config and entrypoints in `apps/mobile`; WXT config and popup entrypoints in `apps/extension`; `packages/backend/convex/{schema,auth.config}.ts`; per-app `.env.example` files.

**Interfaces:** Runnable app shells and documented Clerk/Convex environment variables. Web Clerk state feeds `ConvexProviderWithClerk` when configured. Native/extension SDK setup respects platform requirements.

- [x] Build minimal web, mobile, and extension shells.
- [x] Add Clerk dependencies and environment examples; include visible web auth controls when configured.
- [x] Prepare Convex JWT verification using Clerk's issuer and the `convex` JWT template.
- [x] Verify installed SDK types before using volatile native or extension APIs.
- [x] Run `pnpm typecheck`, `pnpm build`, Firefox extension compilation, and Expo dependency checks.

### Task 3: Developer Workflow and Verification

**Files:** `.github/workflows/ci.yml`, `README.md`, this plan.

**Interfaces:** Frozen installs and matching CI/local checks; documented targeted dev commands.

- [x] Document layout, pnpm prerequisites, install/dev/check commands, and Clerk/Convex initialization.
- [x] Add CI checks for formatting, types, and app bundles.
- [x] Verify a web development HTTP response and inspect extension manifests.
- [x] Record actual check results and outstanding external configuration.

## Execution Notes

- Initial checkout is unborn `main` with untracked user files and no application baseline. Work in the supplied workspace; creating a linked worktree would require an unrelated initial commit and moving those files.
- Scaffolding/configuration is verified with actual compilers and bundlers. Do not add tests that only mirror configuration or starter UI.
- The user explicitly chose Clerk; the Convex Auth plugin is not the selected identity provider.

## Verification Results

- pnpm install --frozen-lockfile: passed for all eight workspace projects (root plus seven packages).
- pnpm peers check: passed, no peer dependency issues.
- pnpm check: passed formatting, six source-package typechecks, and three app builds.
- pnpm --filter @mindspool/extension build:firefox: passed.
- pnpm --filter @mindspool/mobile exec expo install --check --pnpm: passed.
- Web development HTTP smoke check: returned 200 and the expected Vite entrypoint.
- Extension manifests: storage/cookies permissions and no host permissions when unconfigured.
- Installed Clerk native component types were inspected before verification.
- No live Clerk sign-in, native device build, or Convex deployment was performed; these require instance configuration and platform tooling.
- Final review: source/configuration inspection; retained the supplied workspace and left changes uncommitted.
