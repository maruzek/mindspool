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

- Chrome (prod build): clipping X posts works from the feed and a single tweet, after reloading stale X tabs. Steps 1 to 7 were not individually re-run on production.
- Firefox (prod build, temporary add-on): clipping X posts works after adding the add-on's `moz-extension://<uuid>` origin to the production Clerk allowed origins. Without it Clerk returned HTTP 400 ("only one of Origin and Authorization"). The UUID is per profile.
- Web: favicon deployed with `pnpm --filter @mindspool/web run deploy` (plain `cf deploy` does not rebuild).
- The `cdn.protect.clerk.com` CSP errors in extension pages are Clerk bot protection and are ignored.
- Web capture bar works on production (owner confirmed).
- Android production APK (EAS `production-apk`): owner confirmed it works on the phone; Clef labels appear in production.
