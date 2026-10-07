# Tasks: web-shell

Plan: [plan.md](plan.md). Spec: [SPEC-web-shell.md](../SPEC-web-shell.md). Follow task order and checkpoints.
Focused test: `pnpm --filter @mindspool/web test`. Typecheck: `pnpm --filter @mindspool/web typecheck`. Full: `pnpm check`.
Adding dependencies (T1) is pre-approved by the spec approval; any others need a question first.

## Phase 1: Foundation

- [x] **T1: Router foundation** (S)
  - Install `@tanstack/react-router` and `@tanstack/router-plugin` (pinned); add the plugin to `vite.config.ts` and
    `vitest.config.ts`; create `routes/__root.tsx`, `routes/index.tsx` (redirect to `/library`), `routes/library.tsx`
    (placeholder heading); mount `RouterProvider` in `main.tsx` inside the existing Clerk/Convex providers; commit
    `routeTree.gen.ts`.
  - Acceptance: `pnpm dev:web` shows "Library" at `/library`; `/` redirects; unknown path shows a not-found component;
    a test renders the route tree with memory history.
  - Verify: `pnpm --filter @mindspool/web test && ... typecheck && ... build`.
  - Files: `package.json`, `vite.config.ts`, `vitest.config.ts`, `src/main.tsx`, `src/routes/*`, `src/routeTree.gen.ts`.

- [x] **T2: Auth gate, draft provider, old gate removed** (M)
  - Move `captureDraft.ts` (+ tests) to `src/capture/`; add `CaptureDraftProvider`; create `shell/AuthGate.tsx` with states:
    Clerk loading, signed out (Clerk modal sign-in/up), Convex connecting, auth failure (Reconnect + retained input), error
    boundary, auth-not-configured, backend-not-configured; wire into root route. Port every `App.test.tsx` draft/auth test to
    the new structure **before** deleting `App.tsx`, `CaptureSession.tsx`, `Workspace.tsx`, `App.test.tsx`.
  - Acceptance: state matrix tests green; draft survives auth failure, reload, session change, stale purge (existing cases);
    each state has distinct announced text.
  - Verify: tests + typecheck + build.
  - Files: `src/capture/*`, `src/shell/AuthGate.tsx`, `src/shell/StateNotice.tsx`, `src/routes/__root.tsx`, `src/shell/AuthGate.test.tsx`.

- [x] **T3: Sidebar primitives and dark tokens** (M)
  - `shadcn add sidebar sheet dropdown-menu skeleton breadcrumb collapsible` into `packages/ui` (hooks under
    `@mindspool/ui/hooks`); add `--sidebar-*` tokens mapped to semantic tokens; add `.dark-sidebar` override in `globals.css`
    using the design values (`#1a0b33`, `#240f45`, `#f1ecfb`, `#3d2370`, `#b69cff`); fix imports to `@mindspool/ui/*`.
  - Acceptance: packages/ui typechecks; no hex outside the token definitions; zero radius preserved.
  - Verify: `pnpm typecheck && pnpm --filter @mindspool/web build`.
  - Files: `packages/ui/src/components/{sidebar,sheet,dropdown-menu,skeleton,breadcrumb,collapsible}.tsx`, `src/hooks/use-mobile.ts`, `globals.css`, `package.json`.

### Checkpoint: Foundation

- [ ] `pnpm check` green; app boots through the gate; primitives compile. Review with human.

## Phase 2: Frame

- [x] **T4: Sidebar frame with navigation** (M)
  - `routes/_app.tsx` layout with `AppSidebar`: brand mark (two-square mark from the design), disabled search with tooltip,
    Inbox/Library/Boards/Graph nav (active from URL, `aria-current`), user footer with Clerk `UserButton`/menu including
    "Load examples" (port `LoadExamples` logic using `api.seed.availability`/`load`). Routes `/inbox`, `/library` under it.
  - Acceptance: visually matches design section 02 sidebar at 1440px (colors, 2px rule, zero radius, Archivo); active item
    follows back/forward; examples item hidden unless `seed.availability` allows it.
  - Verify: tests for active-nav mapping and examples visibility; manual side-by-side with design.
  - Files: `routes/_app.tsx`, `shell/AppSidebar.tsx`, `shell/UserMenu.tsx`, `shell/LoadExamples.tsx`, test.

- [x] **T5: Labels in sidebar and label route** (M)
  - Labels section from `api.labels.list`; `+` opens a dialog using `api.labels.create` (trim, 80 chars, case-insensitive
    duplicates surfaced); `routes/_app/labels.$labelId.tsx` shows the label name heading; invalid/foreign id → shared
    Not-found state. Skeleton while loading, empty state when none.
  - Acceptance: create label appears in sidebar and is selectable; wrong id shows "Not found" with no existence leak.
  - Verify: tests (dialog validation, not-found, loading/empty); manual with dev Convex.
  - Files: `shell/LabelsNav.tsx`, `shell/CreateLabelDialog.tsx`, `routes/_app/labels.$labelId.tsx`, `shell/NotFound.tsx`, tests.
  - Depends on: T4.

- [x] **T6: Icon-rail frame, Boards and Graph placeholders** (S)
  - `routes/_rail.tsx` with the 60px rail (brand mark + four icons, active highlight, tooltips); `/boards`, `/boards/$boardId`,
    `/graph` render the "Not built yet" state. Sidebar nav links reach them.
  - Acceptance: switching between `_app` and `_rail` routes keeps the gate mounted (no auth flash); rail matches design 03/04.
  - Verify: route tests; manual.
  - Files: `routes/_rail.tsx`, `shell/IconRail.tsx`, `routes/_rail/{boards,graph}.tsx`.
  - Depends on: T4.

### Checkpoint: Desktop navigation

- [ ] `pnpm check` green; full navigation works against dev Clerk/Convex; compared to the design. Review with human.

## Phase 3: Polish and close

- [x] **T7: Mobile sheet and accessibility** (S)
  - Below 768px the sidebar is an off-canvas sheet behind a menu button; rail hides its labels; skip-to-main link; focus
    ring uses `:focus-visible`; headings/landmarks (`nav`, `main`) labelled.
  - Acceptance: 390px has no horizontal scroll; sheet opens/closes by button, Escape, and route change; axe has no serious issues.
  - Verify: tests for sheet toggle; manual at 390px; axe/Lighthouse on `/library`.
  - Files: `shell/AppSidebar.tsx`, `routes/_app.tsx`, `routes/__root.tsx`, tests.
  - Depends on: T4, T6.

- [x] **T8: Remove remaining old UI** (S)
  - Deleted `SaveItemForm`, `ItemList`, `ItemDetail`, `ItemLabelControls`, `LabelList`, `ProcessingHistory` from
    `apps/web/src` (`style.css`, `LoadExamples` and the old gate went in T2/T4). Their behavior is re-specified by
    `library-view`/`item-inspector`.
  - Kept on purpose: `WorkspaceShell` in `packages/ui` (the browser-extension popup still uses it; `capture-clients`
    is out of scope) and `packages/ui/.../mindspool/*` (unused for now; `library-view`'s spec decides reuse or removal,
    per the capability map).
  - Acceptance met: no imports of removed files; no `style.css`; no raw hex in `apps/web/src`; extension still builds.
  - Verify: `pnpm test`, `pnpm typecheck`, web and extension builds.
  - Depends on: T4.

- [ ] **T9: Verification record and docs** (S) — report and docs written; manual browser checks pending (criteria 2, 3 visual, 6, 8 in `docs/verification/web-shell.md`)
  - Write `docs/verification/web-shell.md` (commands, 1440px/390px comparison notes, a11y results); update
    `README.md`/`docs/core-concepts.md` (routes, shell, how drafts work) and `CAPABILITY-MAP-web-redesign.md` status.
  - Acceptance: every spec success criterion is checked with evidence; open questions updated with decisions taken.
  - Verify: `pnpm check` and manual run.
  - Depends on: T1–T8.

### Checkpoint: Complete

- [ ] All SPEC-web-shell success criteria met; human review; then write `SPEC-library-view.md`.
