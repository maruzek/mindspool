# Web shell verification

Date: 2026-10-06. Branch: `feature/web-shell` (uncommitted at the time of writing).
Spec: [SPEC-web-shell.md](../../SPEC-web-shell.md). Plan: `tasks/plan.md`.

## Automated

| Check                                  | Result                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm test` (backend)                  | 7 files, 40 tests pass (includes new `labels.get` test)                          |
| `pnpm test` (web)                      | 6 files, 47 tests pass                                                           |
| `pnpm typecheck`                       | 6 of 6 workspaces pass                                                           |
| `pnpm build`                           | web, Chrome extension, and Android export build                                  |
| `pnpm format:check`                    | Fails only on `.mcp.json`, committed earlier in `shadcn init` and untouched here |
| Raw hex in `apps/web/src`              | None                                                                             |
| Imports of removed files / `style.css` | None                                                                             |

Web tests (Clerk and Convex mocked) cover: every gate state; session-scoped draft
retention (reload restore, malformed storage, max length, stale purge, account change and
sign-out, auth interruption, older save not erasing a newer draft); redirect `/` and
unknown-path Not found; active navigation for all four destinations including
back; disabled search; account menu (examples hidden, loaded, failed, sign-out);
labels list (links, active state, loading, empty, load more); label page
(name, loading, Not found); create-label dialog (blank, 80-char limit, trimmed
create then navigate, failure); icon rail frames and frame switching; mobile
sheet (open, Escape, close on navigation, desktop inline); skip link and landmarks.

## Success criteria

| #   | Criterion                                                       | Evidence                                                                                                                                                       |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm check` passes, no tests dropped without replacement       | Parts pass (see above); `format:check` fails only on the unrelated `.mcp.json`. Old save-form flow tests have no equivalent yet and are owed by `library-view` |
| 2   | 1440px sidebar matches the design                               | **Manual, pending.** Colors were reported wrong once and fixed (legacy `style.css` removed); user confirmed fixed                                              |
| 3   | Rail on Boards/Graph; active item follows URL                   | Tests; visual check pending                                                                                                                                    |
| 4   | `/labels/<id>` heading; wrong id shows Not found, no leak       | Tests and backend test for foreign, missing, malformed ids                                                                                                     |
| 5   | Each gate state reachable and announced; draft survives failure | Tests                                                                                                                                                          |
| 6   | 390px: sheet, no horizontal scroll                              | Sheet tested; **scroll and look are manual, pending**                                                                                                          |
| 7   | No removed-file imports, `style.css`, raw hex                   | Verified by grep and build                                                                                                                                     |
| 8   | Accessibility score at least 95 on `/library`                   | Met: Lighthouse accessibility 100 on the user's signed-in dev-server run and 100 on a production preview (signed out). See Lighthouse below                    |

## Lighthouse (2026-10-06)

- **Signed-in dev-server run (user, `localhost:5173`):** performance 33, accessibility 100, best practices 77, SEO 82.
  The performance score is not meaningful: the dev server serves about 15 MB of unbundled, unminified modules
  (a 5.5 MB `lucide-react` prebundle, development React). Observed FCP was 1.8 s and LCP 2.3 s; the 42 s and 82 s
  figures are Lighthouse's simulated mobile throttling applied to that payload.
- **Production preview, signed out (`vite preview`, mobile emulation, extensions disabled):** performance 81,
  accessibility 100, best practices 73, SEO 100. Observed FCP 0.19 s and LCP 1.2 s; simulated FCP 2.5 s, LCP 4.2 s,
  TBT 140 ms, CLS 0.008, 633 KiB transferred. First-party JavaScript is about 227 KB gzipped.
- **Fixed:** missing meta description and invalid `robots.txt` (the dev server returned `index.html` for it).
  SEO is now 100.
- **Not an app defect:** best practices is held down by two third-party cookies and the matching DevTools issue from
  the Clerk development instance (`*.clerk.accounts.dev`). A Clerk production instance on your own domain serves them
  first-party.
- **Remaining performance cost:** the LCP element is the sign-in text, which waits for Clerk to load (about 360 KB from
  `accounts.dev`, including its modal UI). Signed-in numbers were not measured on a production build.

## Deviations from the spec and plan

- Added read-only `labels.get` (string id, owner-checked, null otherwise) for the label route; no schema change.
- Router plugin is not in `vitest.config.ts`; tests import the committed route tree.
- `WorkspaceShell` and `packages/ui/.../mindspool/*` remain: the extension popup uses the former, and `library-view`
  decides the latter.
- `style.css` was removed in T4 rather than T8 because it overrode Tailwind in the sidebar.
- Duplicate label names open the existing label (the backend reuses names), rather than showing an error.
- Boards and Graph are reachable from the rail but the rail has no account menu, matching the design.

## Manual checks still needed

Run `pnpm dev:web`, sign in, and: compare against design sections 02 to 04 at 1440px;
repeat at 390px checking for horizontal scroll; create a label and open it; open a
made-up `/labels/xyz`; run Lighthouse accessibility on `/library`. Record results here.
