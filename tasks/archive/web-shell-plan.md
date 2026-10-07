# Implementation Plan: web-shell

Spec: [SPEC-web-shell.md](../SPEC-web-shell.md) (approved). Capability map:
[CAPABILITY-MAP-web-redesign.md](../CAPABILITY-MAP-web-redesign.md), module 1 of 7. The completed library-foundation
plan is archived in `tasks/archive/`. Tasks: [todo.md](todo.md).

## Overview

Replace the `apps/web` UI with a TanStack Router SPA whose layout route is the Modernist frame (dark 240px sidebar, 60px
icon rail for Boards/Graph, mobile sheet). Keep the Clerk → Convex-verified gate and session-scoped capture drafts. Later
modules mount into this frame.

## Architecture Decisions

- **Router:** `@tanstack/react-router` + `@tanstack/router-plugin` (Vite, file-based, `routeTree.gen.ts` committed). SPA only;
  Cloudflare static-assets deployment is out of scope here.
- **Gate placement:** one `AuthGate` wraps the layout route's `<Outlet/>`. Data hooks mount only after `useConvexAuth()` is
  authenticated (unchanged rule). A `CaptureDraftProvider` sits above the gate so the draft survives auth outages and is
  available to `library-view`'s capture bar later.
- **Layout routes:** `_app` (sidebar frame: Inbox, Library, labels) and `_rail` (icon-rail frame: Boards, Graph). Both share
  `AuthGate` through the root.
- **Sidebar:** shadcn `sidebar` primitives installed into `packages/ui`, composed in `apps/web/src/shell`, adapted from ReUI
  `c-sidebar-1`/`c-sidebar-2`. Dark look is one `.dark-sidebar` token-override class in `globals.css`.
- **Not in this module:** item lists, capture UI, inspector, counts, working search.
- **Old UI removal** is staged so the app stays buildable: new entry first (T1), port gate and tests and delete the old
  `App`/`Workspace`/`CaptureSession` (T2), delete the remaining leftovers last (T8).

## Dependency Graph

```
T1 router foundation
 ├─ T2 auth gate + draft provider + old UI removal ─┐
 └─ T3 sidebar primitives + dark tokens ────────────┤
                                                    ├─ T4 sidebar frame (nav, user menu, examples loader)
                                                    │     ├─ T5 labels in sidebar + create dialog + label route
                                                    │     └─ T6 icon-rail frame + Boards/Graph placeholders
                                                    └─ T7 mobile sheet + a11y
                                                          └─ T8 cleanup  └─ T9 verification
```

T2 and T3 are independent of each other; T5 and T6 are independent after T4.

## Risks and Mitigations

| Risk                                                                                             | Impact | Mitigation                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn `sidebar` assumes `@/` aliases and its own CSS variables, not the `@mindspool/ui` aliases | Med    | Install via `-c packages/ui` (components.json already aliases `@mindspool/ui/*`); adjust imports in T3; add `--sidebar-*` tokens mapped to existing semantic tokens |
| Dark-subtree override leaks into portaled menus/dialogs                                          | Med    | Portals render outside the sidebar so they stay light; verify the user menu and tooltips visually in T4                                                             |
| Router plugin + Vitest: generated route tree and jsdom                                           | Med    | Tests render a memory-history router built from the generated tree; T1 proves the pattern                                                                           |
| Draft-retention regressions during gate rewrite                                                  | High   | T2 ports every existing draft/auth test first and requires them green before deleting old code                                                                      |
| Zero-radius/2px-rule look drifts from shadcn base-nova defaults                                  | Low    | Tokens already set `--radius:0`; visual check against design in T4/T9                                                                                               |
| Convex `labels.list` pagination/limit unknown for the sidebar                                    | Low    | Read `labels.ts` in T5; cap rendered labels and show a "More" row if truncated                                                                                      |

## Checkpoints

- After T3: `pnpm check` green; `/library` renders inside a bare router; sidebar primitives compile.
- After T6: full navigation works end to end on desktop against dev Clerk/Convex; compare with design. Review with human.
- After T9: all spec success criteria met.

## Open Questions

Carried from the spec; defaults assumed, none block T1–T4: Inbox/label counts (deferred to `search-and-filters`), disabled sidebar
search, placeholder nav items, path-based label route, examples loader in user menu.
