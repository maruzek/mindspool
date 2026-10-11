# Spec: Production deploy (single-user)

## Objective

Run MindSpool in production for one user (the owner): web app on Cloudflare Workers under a custom domain, backend on a Convex production deployment, auth on a new Clerk production instance. The Android app is sideloaded (no Play Store). The extension is installed unpacked in Chrome (no Chrome Web Store, no Firefox store). Nobody else can sign up or read data.

Success means the allowed users can sign in on web, Chrome and Android against production, clip from X and Reddit, see Clef labels appear, and a second Clerk account is refused at both Clerk and Convex.

## Assumptions (correct me before approval)

1. Web is a static Vite SPA, so Workers static assets with SPA fallback is enough. No Worker code and no SSR.
2. Convex production calls Workers AI by REST (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN`). No Worker AI binding.
3. Clerk production requires a custom domain, which you have chosen. The domain is `mindspool.martinruzek.eu`.
4. Chrome extension uses the existing WXT MV3 build with `build` (chrome target). Its ID stays stable via `CLERK_EXTENSION_PUBLIC_KEY`, and Clerk's allowed origins list `chrome-extension://<id>`.
5. Android is built with EAS (`preview` profile, APK) and sideloaded. No store submission, no EAS Update.
6. Firefox build and the `build:firefox` CI step stay as they are; they are just not published.
7. Data in the current dev Convex deployment is not migrated. Production starts empty.
8. Deploys are run by hand from this machine. No CD pipeline (CI stays check-only).

## Tech Stack

Cloudflare Workers + static assets (Wrangler), Convex 1.46 (prod deployment), Clerk (production instance, `@clerk/react` 6.17.5, Expo, Chrome extension SDK), WXT (extension), Expo/EAS (Android APK), pnpm 12 + Turborepo.

## Commands

```
Check all:        pnpm check
Web build:        pnpm --filter @mindspool/web build
Web deploy:       pnpm --filter @mindspool/web deploy          (new: build + wrangler deploy)
Web local test:   pnpm --filter @mindspool/web exec wrangler dev
Convex deploy:    pnpm --filter @mindspool/backend exec convex deploy
Convex env:       pnpm --filter @mindspool/backend exec convex env set --prod NAME value
Extension build:  pnpm --filter @mindspool/extension build          (Chrome MV3, .output/chrome-mv3)
Extension zip:    pnpm --filter @mindspool/extension exec wxt zip   (only if needed)
Android build:    pnpm --filter @mindspool/mobile exec eas build -p android --profile production-apk
```

Wrangler/Convex/EAS commands that touch production need your explicit go-ahead each time (see Boundaries).

## Project Structure

```
apps/web/wrangler.jsonc       new: Worker name, assets dir ./dist, SPA fallback, custom domain route
apps/web/.env.production      new, gitignored; real values live outside git
apps/extension/.env.production new, gitignored
apps/mobile/eas.json          add production-apk profile (APK, prod env)
packages/backend/convex/auth.ts   add owner guard
packages/backend/convex/auth.test.ts  tests for the guard
docs/deploy.md                runbook: ordered steps, env var table, rollback
docs/verification/deploy.md   evidence: manual walkthroughs and results
```

## Code Style

Match the repo: TypeScript strict, small pure functions, Vitest next to the code. The access guard is one function used by the existing identity helper, with the allowed owner read from a Convex env var:

```ts
export function assertAllowed(
  identity: UserIdentity,
  allowedSubjects: string | undefined,
) {
  // Unset in dev so local work is unaffected; set in prod.
  const allowed =
    allowedSubjects
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  if (allowed.length > 0 && !allowed.includes(identity.subject)) {
    throw new ConvexError({ code: "FORBIDDEN" });
  }
}
```

## Workstreams

1. **Access limit.** In the Clerk production dashboard turn off public sign-up (Configure, User & authentication, Access mode: **Waitlist**; invite-only is the stricter alternative. Both disable sign-up). In Convex add `MINDSPOOL_ALLOWED_SUBJECTS` (comma-separated Clerk user ids; supports several accounts, each keeps its own separate data) and enforce it in the shared auth helper so every query, mutation and action goes through it. No env var set means no restriction, so dev and tests are unchanged.
2. **Convex prod.** Create the prod deployment, set `CLERK_JWT_ISSUER_DOMAIN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN`, `AI_DAILY_NEURON_LIMIT`, `MINDSPOOL_ALLOWED_SUBJECTS`, `MINDSPOOL_ENVIRONMENT=production`. `MINDSPOOL_ENABLE_DEV_SEED` must stay unset. Deploy functions.
3. **Clerk prod.** Production instance on your domain, JWT template `convex`, allowed origins for the web domain and the extension ID, publishable key for each client.
4. **Web on Workers.** `wrangler.jsonc` with assets and SPA fallback, custom domain, build with prod `VITE_*` values, deploy.
5. **Chrome extension.** Build the Chrome target with prod `WXT_PUBLIC_*` values and the stable key, load unpacked, run the walkthrough below. Fix whatever breaks (this has never been run in Chrome).
6. **Android.** EAS production-apk profile with prod `EXPO_PUBLIC_*`, build, install by file, run the existing adb/real share checks against prod.
7. **Runbook.** `docs/deploy.md` with order, env table, rollback (redeploy previous Worker version; Convex redeploy previous commit), and where secrets live.

Order: Clerk prod and domain, then Convex prod (with owner guard), then web, then extension, then Android.

## Chrome extension walkthrough (acceptance)

Against production, in Chrome with the unpacked build:

1. Popup shows sign-in, signing in works and survives a browser restart.
2. Clip an X post (text, one with images, a quote post): item appears in the web Library with the same fields as the Firefox output.
3. Clip a Reddit post from feed and detail view; clip a single comment.
4. Re-clip the same post shows "already saved", not a duplicate.
5. Signed-out clip shows a sign-in prompt, not a silent failure.
6. Popup link opens the production web URL.
7. No console errors in the service worker, popup or content scripts.

## Testing Strategy

- Unit: Vitest for the owner guard (owner passes, other subject refused, unset env passes, unauthenticated refused) in `packages/backend`. `pnpm check` stays green.
- Config: a build test or script check that the production web build contains no `localhost` URL and no dev Clerk key (`pk_test_`).
- Manual, recorded in `docs/verification/deploy.md`: Chrome walkthrough, web sign-in on the real domain, second Clerk account refused, Android share against prod, Clef labels appear.

## Boundaries

- Always: run `pnpm check` before any deploy; announce the target deployment (dev or prod) before running Convex or Wrangler commands; keep secrets out of git.
- Ask first: any command that deploys or changes prod (`convex deploy`, `wrangler deploy`, `eas build`, `convex env set --prod`); adding dependencies (wrangler); changing the Convex schema; changing CI.
- Never: commit keys or tokens; set `MINDSPOOL_ENABLE_DEV_SEED` in prod; run the seed or `recountOwnerStats` against prod without asking; publish to any store.

## Success Criteria

- Web at the custom domain loads, signs in, and lists items from Convex prod.
- An account not in `MINDSPOOL_ALLOWED_SUBJECTS` cannot sign up (waitlist), and if one is created anyway, every Convex call returns `FORBIDDEN`. Both are tested and recorded.
- Chrome walkthrough items 1 to 7 pass with evidence.
- Android APK from EAS installs, signs in, saves a shared X link that shows on the web within seconds.
- Clef labeling runs in prod and respects `AI_DAILY_NEURON_LIMIT`.
- Built artifacts contain no `pk_test_` key, no dev Convex URL, no `localhost`.
- `docs/deploy.md` lets a fresh checkout redeploy everything in order.

## Decisions (resolved)

1. Domain: `mindspool.martinruzek.eu`, DNS already on Cloudflare.
2. Android is built on **EAS cloud** (Expo's servers build the APK; this machine has no Java or Android SDK, and the app is already linked to Expo project `maruzek`). Needs a free Expo account login and `eas-cli`; the output is an APK file you copy to the phone.
3. `AI_DAILY_NEURON_LIMIT` in prod keeps the dev value.
4. `CLERK_EXTENSION_PUBLIC_KEY` is not generated yet. A task creates the key pair, stores the private key outside git, and derives the stable extension ID, which Clerk needs as an allowed origin.

## Open Questions

1. Confirm EAS free plan covers one cloud Android build (the free tier allows a limited number of builds per month; check the Expo billing page). If not, fall back to a local build, which needs Java and the Android SDK installed.
