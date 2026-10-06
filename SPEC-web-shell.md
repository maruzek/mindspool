# Spec: web-shell

Module id `web-shell` in [CAPABILITY-MAP-web-redesign.md](CAPABILITY-MAP-web-redesign.md). Depends on the
existing `identity` and `core-library` modules. Design source: `Mindspool Base Modernist v3.dc.html`,
section 02 (sidebar and frame) and the 60px rail of sections 03/04.

## Objective

Replace the current `apps/web` UI with the Modernist application frame, so every later module
(`library-view`, `item-inspector`, `boards`, `graph`, …) mounts into it. This module delivers the frame, routing,
navigation, and the auth/loading/error states. It does not deliver item lists, capture, or the inspector.

Success looks like: a signed-in user lands in a dark sidebar + content area that matches the design, can move
between Inbox / Library / Boards / Graph and between their labels through URLs, and sees understandable states
for signed out, connecting, auth failure, and backend unavailable. Unsaved capture input is still never lost.

Users: a single signed-in owner on desktop-first web, usable down to phone width.

## Assumptions

1. Vite SPA with TanStack Router and file-based routes. No SSR; deployed later as static assets on Cloudflare Workers.
2. Keep Clerk, `ConvexProviderWithClerk`, `CaptureSession`-style gating (Convex-verified auth before data hooks mount),
   and `captureDraft.ts` with its tests. Delete the rest of the current UI and `src/style.css`.
3. The sidebar is dark through a scoped token override on the sidebar element (as in the design), not a global dark mode.
4. Shell uses shadcn `sidebar` as the structural base, adapted from ReUI `c-sidebar-1` (grouped nav, footer account menu)
   and `c-sidebar-2` (icon rail). Styling comes from tokens in `packages/ui/src/styles/globals.css`; no per-screen CSS file.
5. Icons: Lucide (already the design and shadcn icon library).
6. Routes for modules not yet built (`/boards`, `/graph`) exist and render an explicit "Not built yet" empty state.
7. The sidebar search box is rendered but disabled until `search-and-filters`. Label counts and the Inbox count are
   omitted until `search-and-filters` supplies them. Both are listed in Open Questions.

## Tech Stack

React 19.2, Vite 8, Tailwind 4.3, shadcn `base-nova` + `@base-ui/react`, ReUI registry (`@reui`), Clerk (`@clerk/react`),
Convex 1.46, Vitest 5 + Testing Library, TypeScript 6. New: `@tanstack/react-router` and `@tanstack/router-plugin`
(requires approval; see Boundaries). Exact versions pinned like the existing dependencies.

## Commands

```
Dev:        pnpm dev:web
Test:       pnpm --filter @mindspool/web test
Typecheck:  pnpm --filter @mindspool/web typecheck
Build:      pnpm --filter @mindspool/web build
Format:     pnpm format
All checks: pnpm check
Add UI:     pnpm dlx shadcn@latest add <item> -c apps/web      (ReUI: add @reui/<item>)
```

## Routes

| Path                          | Screen                    | Notes                                                                |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `/`                           | redirect to `/library`    |                                                                      |
| `/inbox`                      | Inbox placeholder         | filled by `search-and-filters`                                       |
| `/library`                    | Library (all items)       | content by `library-view`; shell provides the frame and heading slot |
| `/labels/$labelId`            | Library filtered by label | invalid or foreign id shows the shared "Not found" state             |
| `/boards`, `/boards/$boardId` | "Not built yet"           | filled by `boards`; uses the icon-rail frame                         |
| `/graph`                      | "Not built yet"           | filled by `graph`; uses the icon-rail frame                          |

The sidebar frame is the layout route. Boards and Graph switch it to the 60px icon rail. Library and Inbox use the
240px sidebar. Typed search params (`layout`, `item`, later `source`) are declared by `library-view`, not here.

## Project Structure

```
apps/web/src/
  main.tsx                    providers + router mount
  routes/                     TanStack file routes (__root, _app, library, labels.$labelId, inbox, boards, graph)
  routeTree.gen.ts            generated, committed
  shell/                      AppSidebar, IconRail, UserMenu, AuthGate, ErrorBoundary, StateNotice
  capture/captureDraft.ts     moved unchanged (+ its tests)
packages/ui/src/components/   shadcn + reui primitives (sidebar, dropdown-menu, skeleton, breadcrumb, …)
packages/ui/src/components/mindspool/   kept only if still used; otherwise removed
```

Removed: `App.tsx`, `Workspace.tsx`, `CaptureSession.tsx`, `SaveItemForm.tsx`, `ItemList.tsx`, `ItemDetail.tsx`,
`ItemLabelControls.tsx`, `LabelList.tsx`, `LoadExamples.tsx`, `ProcessingHistory.tsx`, `style.css`, and
`WorkspaceShell` in `packages/ui`. Behavior owned by them (capture, list, detail, examples) is re-specified by
`library-view` and `item-inspector`; nothing is silently dropped. The development examples loader moves to the user
menu in this module so seed data stays reachable.

## Code Style

Match the current repo: Prettier, named exports, function components, kebab-case files in `packages/ui`,
PascalCase in `apps/web`. Semantic tokens only, never raw hex.

```tsx
// good: token classes, component from the registry, scoped dark override
<Sidebar className="dark-sidebar border-r-2 bg-card text-foreground">
  <SidebarMenuButton isActive={active} render={<Link to="/library" />}>
    <ListIcon /> Library
  </SidebarMenuButton>
</Sidebar>
```

The `.dark-sidebar` override is one class in `globals.css` that redefines `--background`, `--card`, `--foreground`,
`--border`, `--primary`, `--accent` for its subtree, using the values in the design (`#1a0b33`, `#240f45`, `#f1ecfb`,
`#3d2370`, `#b69cff`).

## Behavior

- Auth gate order is unchanged: Clerk loaded → signed in → Convex authenticated → mount data hooks.
- States (each with its own accessible text, `role=status` or `role=alert`): Clerk loading, signed out (Clerk modal sign-in/up),
  Convex connecting, Convex auth failure (Reconnect button, unsaved draft kept), library load error boundary, backend not
  configured, auth not configured.
- Active nav item is derived from the URL (`aria-current="page"`); labels list uses the paginated/limited `labels.list`.
- Label creation from the sidebar `+` opens a dialog using `labels.create` (name limits unchanged).
- Mobile (<768px): sidebar becomes an off-canvas sheet behind a menu button; rail variants hide.
- Keyboard: skip link to main, visible `:focus-visible` ring, sidebar toggle shortcut as provided by shadcn.

## Testing Strategy

Vitest + Testing Library with Clerk and Convex mocked (existing pattern).

- Kept and adapted: all `captureDraft` session-scope tests (draft survives auth outage, reload, session change, stale purge).
- New unit tests: auth gate state matrix (loading, signed out, connecting, failure, ready); route-to-active-nav mapping;
  unknown label id → Not found; redirect `/` → `/library`; mobile sheet toggle; label create dialog validation.
- Typecheck, build, and `pnpm check` must stay green; the generated route tree is checked in and verified fresh in CI.
- Manual: run `pnpm dev:web` against the dev Clerk/Convex, compare against the design at 1440px and 390px, record in
  `docs/verification/web-shell.md`. No visual-regression tooling is added.

## Boundaries

- Always: tokens not hex; zero radius and 2px rules per the design; run `pnpm check` before committing; keep auth gating before data hooks; update docs when a decision changes.
- Ask first: adding dependencies (TanStack Router and plugin are requested here), backend schema changes, changing CI or Clerk/Convex config, adding Cloudflare config.
- Never: edit `_generated` Convex files by hand, remove or weaken existing draft or auth tests, commit secrets or `.env`, restyle a ReUI/shadcn component with ad-hoc CSS instead of tokens, reintroduce a global stylesheet for screens.

## Success Criteria

1. `pnpm check` passes with no skipped or deleted-without-replacement tests.
2. Signed in at 1440px: 240px dark sidebar (brand mark, disabled search, Inbox/Library/Boards/Graph, Labels section, user footer) next to content, matching the design's colors, 2px rules, zero radius, Archivo.
3. Boards and Graph routes show the 60px icon rail and the "Not built yet" state; sidebar and rail highlight the active destination from the URL, including on reload and via back/forward.
4. `/labels/<id>` shows the label name as the page heading; a wrong or foreign id shows "Not found" without leaking existence.
5. Each gate state in the Behavior list is reachable in tests and shows distinct, announced text; an unsaved draft survives the auth-failure state.
6. At 390px the sidebar is a sheet; no horizontal page scroll.
7. No remaining imports of removed files; no `style.css`; no raw hex or radius values in `apps/web/src`.
8. Lighthouse accessibility ≥ 95 on `/library` (axe: no serious violations).

## Open Questions

1. **Counts:** Inbox and per-label counts need a bounded counting strategy (denormalized counter vs. capped query). Defer to `search-and-filters`? (Assumed yes.)
2. **Sidebar search:** disabled placeholder, or hidden until it works? (Assumed disabled with an explanatory tooltip.)
3. **Placeholders for Boards/Graph in the nav:** show now (assumed) or hide until built.
4. **`/labels/$labelId` vs. `/library?label=`:** assumed path segment so label pages are first-class routes; `library-view` can layer filters as search params.
5. **Dev examples loader:** user-menu item (assumed) or a dev-only banner.
