# Production deploy verification

Status: **not started**. Fill each table with evidence (command output, dates, screenshots) as the tasks in `tasks/todo.md` complete.

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

| Step                                      | Dev | Prod |
| ----------------------------------------- | --- | ---- |
| 1 Sign-in survives browser restart        |     |      |
| 2 Clip X post (text, images, quote)       |     |      |
| 3 Clip Reddit post and comment            |     |      |
| 4 Re-clip shows "already saved"           |     |      |
| 5 Signed-out clip prompts sign-in         |     |      |
| 6 Popup link opens the web URL            |     |      |
| 7 No console errors (worker/popup/script) |     |      |

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
