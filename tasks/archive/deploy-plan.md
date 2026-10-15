# Implementation Plan: Production deploy (single-user)

Source: [SPEC-deploy.md](../../SPEC-deploy.md). Tasks: [todo.md](deploy-todo.md). The Android clipper plan was archived to `tasks/archive/android-clipper-*.md` with its device checks open; they are covered by Task 10 here.

## Overview

Ship MindSpool to production for the owner and a few approved accounts: Convex prod, Clerk production on `mindspool.martinruzek.eu`, web on Cloudflare Workers, Chrome extension loaded unpacked, Android APK built on EAS and sideloaded. Code changes (access guard, Wrangler config, EAS profile, build checks) come first and touch no production system. The Chrome extension, which has never run in Chrome, is exercised against the existing dev stack early so surprises surface before anything is deployed. Production tasks follow, each needing an explicit go-ahead.

## Architecture Decisions

- **One choke point for access.** Every library function already calls `requireOwner` in `packages/backend/convex/auth.ts`. The guard goes there, reading `MINDSPOOL_ALLOWED_SUBJECTS` (comma-separated Clerk ids; unset = no restriction). Direct `ctx.auth.getUserIdentity()` uses (e.g. `processingRuns.ts`) are audited in Task 1.
- **Clerk Waitlist mode** closes sign-up; the Convex guard is the real boundary. Approving someone means two steps: approve in Clerk, add their id to the Convex env var.
- **Workers static assets, no Worker code.** `wrangler.jsonc` with `assets.directory ./dist`, `not_found_handling: "single-page-application"`, custom domain via `routes` with `custom_domain: true`. Wrangler is a new dev dependency (approved with this plan).
- **Build-time public values.** Vite, WXT and Expo bake `*_PUBLIC_*` values into bundles, so prod builds read gitignored `.env.production` files. A script fails the build if a bundle contains `pk_test_`, `localhost`, or the dev Convex URL.
- **Extension key.** Generated once; private key stored outside git (password manager), public DER key base64 in `CLERK_EXTENSION_PUBLIC_KEY`; extension ID derived from it and added to Clerk allowed origins.
- **Android via EAS cloud**, `production-apk` profile (APK, not AAB), prod env, sideloaded. No store, no EAS Update.
- **Deploy by hand**, no CD. CI stays check-only.

## Dependency graph

```
Task 1 guard ─────────────┐
Task 2 web Workers config ┤
Task 3 extension Chrome (dev stack) ┤→ Checkpoint A → Task 6 Clerk prod → Task 7 Convex prod → Task 8 web deploy → Task 9 extension prod
Task 4 EAS profile ───────┤                                                              └→ Task 10 Android prod
Task 5 runbook draft ─────┘                                                                   → Task 11 close-out
```

Tasks 1 to 5 are independent and could be done in any order; Task 3 goes first for fail-fast.

## Risks and Mitigations

| Risk                                                                                | Impact | Mitigation                                                                           |
| ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Extension fails in Chrome (never tested): service worker, Clerk `syncHost`, cookies | High   | Task 3 runs it against dev before any prod work                                      |
| Clerk production needs DNS records on the domain; verification can lag              | Med    | Task 6 starts early; DNS is on Cloudflare so records are added there                 |
| Extension ID changes, breaking Clerk origin                                         | Med    | Generate key in Task 3, reuse for prod; record ID in runbook                         |
| Guard breaks a function that bypasses `requireOwner`                                | High   | Audit in Task 1; test every public function name against the guard (loop over `api`) |
| Dev values leak into prod bundles                                                   | Med    | Bundle check script in Task 2 (and reused for extension/mobile)                      |
| EAS free plan quota or queue time                                                   | Low    | One build needed; fall back to local build only if blocked                           |
| Waitlist-approved user signs in but sees `FORBIDDEN`                                | Low    | Runbook step, plus a clear error in clients                                          |
| Prod `MINDSPOOL_ENABLE_DEV_SEED` set by accident                                    | Med    | Task 7 verifies it is unset via `convex env list --prod`                             |

## Open Questions

1. EAS free plan quota (check Expo billing page at Task 10).
2. Clerk plan limits on production instances (checked at Task 6).
