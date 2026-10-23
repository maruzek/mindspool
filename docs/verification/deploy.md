# Production deploy verification

Status: **in progress** (Chrome walkthrough on dev done 2026-10-11, signed in with Google via `syncHost`; step 5 not tested). Fill each table with evidence (command output, dates, screenshots) as the tasks in `tasks/todo.md` complete.

## Automated

| Check                              | Result | Date |
| ---------------------------------- | ------ | ---- |
| `pnpm check`                       |        |      |
| Access guard tests                 |        |      |
| `check-bundle` fails on dev build  |        |      |
| `check-bundle` passes on prod web  |        |      |
| `check-bundle` passes on extension |        |      |
| `wrangler dev` SPA deep link       |        |      |

## Chrome walkthrough (dev, then production)

| Step                                      | Dev        | Prod |
| ----------------------------------------- | ---------- | ---- |
| 1 Sign-in survives browser restart        | pass       |      |
| 2 Clip X post (text, images, quote)       | pass       |      |
| 3 Clip Reddit post and comment            | pass       |      |
| 4 Re-clip shows "already saved"           | pass       |      |
| 5 Signed-out clip prompts sign-in         | not tested |      |
| 6 Popup link opens the web URL            | pass       |      |
| 7 No console errors (worker/popup/script) | pass       |      |

## Production

| Criterion                                                  | Evidence |
| ---------------------------------------------------------- | -------- |
| Web loads, signs in, lists items from Convex prod          |          |
| Waitlist refuses a second account at Clerk                 |          |
| Unlisted account gets `FORBIDDEN` from Convex              |          |
| `MINDSPOOL_ENABLE_DEV_SEED` unset in prod                  |          |
| Android: sign-in persists after killing the app            |          |
| Android: shared X link saved, visible on web               |          |
| Android: re-share shows "Already saved"                    |          |
| Android: Library list shows live labels                    |          |
| Clef labels appear in prod, daily limit respected          |          |
| Artifacts contain no `pk_test_`, dev Convex URL, localhost |          |

## Production notes (2026-10-11)

- Chrome (prod build): clipping X and Reddit posts works from the feed and a single tweet, after reloading stale X tabs. Steps 1 to 7 were not individually re-run on production.
- Firefox (prod build, temporary add-on): clipping X posts works after adding the add-on's `moz-extension://<uuid>` origin to the production Clerk allowed origins. Without it Clerk returned HTTP 400 ("only one of Origin and Authorization"). The UUID is per profile.
- Web: favicon deployed with `pnpm --filter @mindspool/web run deploy` (plain `cf deploy` does not rebuild).
- The `cdn.protect.clerk.com` CSP errors in extension pages are Clerk bot protection and are ignored.
- Web capture bar works on production (owner confirmed).
- Android production APK (EAS `production-apk`): owner confirmed it works on the phone; Clef labels appear in production.

## Production rollout (2026-10-23)

The user explicitly requested pushing and deploying. Application commit
`9aff83e0cdeaa7d66330380c492edc68e0860d92` was pushed to `origin/main` and
deployed to production, including hidden tweet sources and the searchable label
picker.

- Fresh `VITEST_MAX_WORKERS=1 pnpm check` passed: 1,321 tests (49 schema,
  648 backend, 334 web, 171 extension, 119 mobile), six workspace typechecks,
  formatting, and three builds. Existing test/build warnings remain.
- Convex target: `prod:fleet-eel-131`, project `martin-ruzek:mindspool`.
  Production environment names were checked; `MINDSPOOL_ENABLE_DEV_SEED` was
  absent. `convex deploy --dry-run --yes` passed, then `convex deploy --yes`
  completed with schema validation, role indexes, search filters, and the
  extraction receipt index. No historical migration was run.
- The ignored web `.env.production` was prepared from the existing production
  extension's public Clerk key and Convex URL. `vite build --mode production`
  and `check-bundle` passed, explicitly excluding the development Convex URL.
- Cloudflare worker `mindspool-web` deployed to `mindspool.martinruzek.eu` using
  `cf deploy`, tagged `release-9aff83e`. Version:
  `bd91df6c-f2de-46b1-af71-919de58c5dc8`. Previous available version:
  `fc82651d-2dc5-4878-8a68-77b5d3cb6b91`.
- Live root HTML and its entry JavaScript matched the local production build
  byte for byte. The entry uses production Convex and Clerk settings; `/library`
  returns the same SPA shell. The collaborative browser loaded the sign-in
  screen without application console errors. An unauthenticated production
  `items:stats` query returned `UNAUTHENTICATED`, as expected.

Authenticated production capture and label-picker interaction were not repeated:
the browser had no signed-in production session. Historical tweet conversion
still requires the snapshot-seeded rehearsal described in
[the migration runbook](tweet-links.md). No extension signing, mobile release,
or store publishing was performed.
