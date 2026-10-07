# Capability Map: Web redesign (Mindspool Base Modernist v3)

Source of truth: Claude Design project `d27a478e…` → `Mindspool Base Modernist v3.dc.html`
(sections 01 Foundations, 02 Library, 03 Board, 04 Graph, 05 Capture). Tokens already live in
`packages/ui/src/styles/globals.css`; base primitives are in `packages/ui/src/components`.

Scope: `apps/web` plus the backend functions it needs. The extension popup and Android share
target in section 05 are separate apps and are out of scope (`capture-clients`, later).

## Status

| Module           | Status                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `web-shell`      | Implemented; [verification](docs/verification/web-shell.md) has the open manual checks      |
| `library-view`   | Implemented; [verification](docs/verification/library-view.md) has the open manual checks   |
| `item-inspector` | Implemented; [verification](docs/verification/item-inspector.md) has the open manual checks |
| others           | Not specified yet                                                                           |

## Assumptions

1. Remove the current web UI (`App`, `Workspace`, `SaveItemForm`, `ItemList`, `ItemDetail`, `LabelList`, … and `style.css`) and rebuild it. Keep Clerk auth, Convex client wiring, and the capture-draft retention behavior (`captureDraft.ts`).
2. Components come from shadcn and ReUI, themed by tokens only. No per-screen CSS file. Existing `packages/ui/.../mindspool/*` are reused or replaced by ReUI equivalents where one exists.
3. Dark sidebar uses a scoped dark-token override (as in the design), not a global dark mode.
4. Design data (AI labels with confidence, "Clef-flash", Workers AI, latency/cost) is illustrative. The UI shows a run's real fields when present and an empty or pending state otherwise.
5. Routing: add a small router (`/`, `/library`, `/labels/:id`, `/boards/:id`, `/graph`). Needs approval as a new dependency.
6. Web is desktop-first (1440 grid: 240 sidebar / content / 380 inspector), degrading to a single column on narrow screens.

## Modules

| Module id            | Responsibility                                                                                                                                                                                                                                                                                | Depends on                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `web-shell`          | App frame: dark sidebar (brand, search box, Inbox/Library/Boards/Graph nav, label list with counts, user menu), icon-rail variant for Board/Graph, auth/loading/empty states, router                                                                                                          | existing `identity`                                      |
| `library-view`       | Capture bar (link/note + Save), list/grid toggle, label heading, item rows/cards with confirmed tags and processing state, pagination, selection. Source chips, counts and "Needs review" move to `search-and-filters`                                                                        | `web-shell`, existing `core-library`                     |
| `item-inspector`     | Right panel: source and open-original link, preview, title, saved line, confirmed labels with remove, add label from existing labels, latest processing-run facts, delete. Model labels, Keep/Remove and Classify are in `clef-labeling`; "Add to board" to `boards`                          | `library-view`; adds `items.detail`, `items.remove`      |
| `clef-labeling`      | **Implemented** (replaces `label-suggestions`; [spec](SPEC-clef-labeling.md)): Clef / Clef-flash noul question per label, auto-applied at 50% or more with model attribution, Unsure 50 to 65% with Keep/Remove, Classify in the inspector, label descriptions, library "Labeling…" and toast | `item-inspector`; extends `itemLabels`, `processingRuns` |
| `search-and-filters` | Backend search over title/content, source and "needs review" filters, Inbox (unlabeled or processing items) with count                                                                                                                                                                        | `library-view`                                           |
| `boards`             | Spatial board: board CRUD, placed items, notes, label frames, zoom/pan, unplaced tray                                                                                                                                                                                                         | `library-view`; new tables                               |
| `graph`              | Network graph: label hubs, items as nodes, shared-label and explicit links, cluster/filter controls, hover card                                                                                                                                                                               | `clef-labeling`, `boards` (links)                        |
| `capture-clients`    | Extension popup and Android share sheet (**out of scope here**)                                                                                                                                                                                                                               | —                                                        |

Build order: `web-shell` → `library-view` → `item-inspector` → `search-and-filters` → `clef-labeling` → `boards` → `graph`

## Backend gap (what the current Convex API cannot do for the design)

- No suggestion model: `itemLabels` holds only manual `include`/`exclude`. The design needs suggested (score, run id), accepted, and rejected states.
- No search, no source/host facet, no Inbox/"needs review" query, no reprocess trigger, no label counts.
- No boards, board placements, notes, frames, or explicit item-to-item links (graph).
- Model execution and scraping are not implemented (documented as later work). The design's "Labeling…" states render from real `enrichment` state only.

## Gate

Please review module boundaries, dependency direction, build order, and which modules are in this initiative. After approval I will write `SPEC-web-shell.md` first, then continue module by module, stopping for review after each spec.
