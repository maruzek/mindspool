# Spec: boards

Module id `boards` in [CAPABILITY-MAP-web-redesign.md](CAPABILITY-MAP-web-redesign.md).
Status: **Implemented; authenticated acceptance partially open.**
The user invoked planning after spec review. See [the implementation plan](tasks/plan.md)
and [task checklist](tasks/todo.md). Implementation and automated checks are recorded in [verification](docs/verification/boards.md); authenticated desktop checks remain open. Production deployment is outside this plan.

## Objective

Give each label a persistent, manually arranged spatial view of its library items.
Users switch between List, Grid, and Board on the same label page, find items in a
bottom library tray, and drag them onto the canvas. They organize cards into
columns, add headings, and draw connections without changing the underlying
content or label assignments through organizational actions.

MindSpool should feel like Milanote for spatial organization, while using the
existing MindSpool design and library. The first release targets the owner's
desktop mouse and trackpad workflow. A board is an alternative **view of a
label**, not a second collection model.

## Sources and precedence

- Product behavior: decisions from the boards interview, recorded below.
- Visual source: local, gitignored [deisgn.html](deisgn.html), exported from Claude
  Design as `Mindspool Base Modernist v3.dc.html`, especially `03 Web — Board`
  and the Foundations section. The filename is intentionally preserved.
- Existing contracts: [core concepts](docs/core-concepts.md),
  [library view](SPEC-library-view.md), [item inspector](SPEC-item-inspector.md),
  and [search and filters](SPEC-search-and-filters.md).
- Interaction reference: Milanote's [columns](https://help.milanote.com/en/articles/10478526-columns)
  and spatial card organization. This is not a requirement to reproduce every
  Milanote feature.

Interview decisions override illustrative behavior in the design. Design tokens,
typography, borders, shadows, iconography, and control styling govern the visuals.
The design's independent board name, freeform frame, export button, archived
media facts, and sample counts do not make those features part of v1. Show real
data only. The expanded searchable tray is an intentional extension of the
mockup's small “Unplaced” strip.

The export is not committed. Record the necessary visual measurements in tracked
documentation during implementation so a clean checkout does not depend on the
ignored file for behavioral contracts.

## Confirmed decisions

| Area                | Contract                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board identity      | One persistent board view per label; independent boards are later work.                                                                                         |
| Membership          | Label membership defines eligible content. Items are never placed automatically.                                                                                |
| Tray                | Current label by default; “All library” available; search, filters, sorting; newest first by default.                                                           |
| Outside item        | Dropping an item from All library assigns the current label and places the card.                                                                                |
| Uniqueness          | At most one placement of an item on a board; reuse across different boards is allowed.                                                                          |
| New content         | A dialog creates plain-text notes, saves them to the library, assigns the current label, and places them. Scraping is later work.                               |
| Organization        | Columns, headings, and connections belong to the board and do not alter items or labels.                                                                        |
| Cards               | Default size, image above truncated text, equal default text-area height with or without an image, freely resizable; image-only, text-only, and combined modes. |
| Text editing        | No existing-item text editing or styling in v1. Inline editing with formatting selected text is later work.                                                     |
| Item interaction    | Single-click selects; double-click opens the existing inspector.                                                                                                |
| Columns             | Ordered vertical stacks; column width determines card width; each card height is resizable; leaving a column restores its earlier free-standing size.           |
| Column deletion     | Cards remain on the canvas at their current positions with connections intact. **Provisional: revisit this behavior in a later revision.**                      |
| Connections         | Attach to cards, follow movement, and support optional arrowheads, labels, and color; board-specific.                                                           |
| Removing placement  | Preserves the item and its label assignments. It becomes unplaced in the tray.                                                                                  |
| Removing membership | Removes that item's placement from the label board.                                                                                                             |
| History             | Multi-select and undo/redo; history changes board organization only, preserving created items and assigned labels.                                              |
| Persistence         | Autosave with Saving / Saved / Couldn't save status; restore last pan and zoom.                                                                                 |
| Platform            | Desktop only in v1; collaboration and offline editing deferred.                                                                                                 |
| Package             | Free, open-source `@xyflow/react`; custom board behavior; no paid Pro dependency.                                                                               |
| Visuals             | Claude design export defines the design.                                                                                                                        |
| Scale               | Typical boards are well below 500 cards; 100 is the proposed initial verification fixture, not a product limit.                                                 |

## Scope

### V1

Label Board view, library tray, manual placements, note creation, card display
modes and resizing, columns, headings, connections, multi-selection, undo/redo,
item inspector integration, autosave, viewport restoration, and ownership checks.

### Deferred

- Independent boards with their own identity and membership.
- Virtual labels combining existing labels, including their board views.
- Freeform frames: **v2**, distinct from ordered columns.
- Nested boards, checklists as a new item type, freehand drawing, templates,
  layout automation, snapping/alignment guides, and board export.
- Inline note editing and rich formatting applied to **selected text**. The
  earlier whole-card styling suggestion was superseded; formatting scope and
  storage require their own future decision.
- Creating URLs through the new-item dialog and subsequent scraping/enrichment.
- Mobile/tablet editing, multi-user collaboration, presence, and durable offline
  editing.
- Network graph work and inferred relationships. Board connections do not
  automatically become global item relationships.

## User experience

### Navigation and canvas

1. Add Board beside List/Grid on `/labels/$labelId`; write `layout=board`.
   Preserve typed router state and back/forward behavior. Board is valid only
   for label pages in v1; Library and Inbox retain List/Grid.
2. Use the existing icon-rail frame while viewing a board; restore the ordinary
   label frame when returning to List/Grid. The actual label name identifies the
   board; renaming a label does not reset its layout.
3. First open has an empty canvas and an open tray, even if the label contains
   many items. Explain “Drag items from the library below onto this board.”
   Do not prepopulate headings, cards, or columns from sample design data.
4. Use the design's 60px rail, 24px grid at 100% zoom, floating left tools,
   selected-card toolbar and resize handles, and bottom-right zoom controls as
   visual references. The 1440×900 mockup is a reference viewport, not a fixed
   page size. Keep controls clear of the tray and inspector.
5. Provide Select, Pan, New note, Heading, Column, and Connect tools. Replace
   the mockup's Frame action with Column; omit unsupported Export.
6. Select mode allows free placement, overlap, and marquee selection. Pan mode
   drags the canvas. Space temporarily pans when focus is not in an input.
   Trackpad scroll pans; pinch or Ctrl/Cmd+wheel zooms. Include zoom out/in,
   percentage, and Fit to content. Proposed zoom range: 25–200%.
7. Selection, tool controls, tray, and inspector do not scale with the canvas.
   Opening the inspector must not move or resize persisted cards.
8. Invalid, foreign, or removed labels use the existing Not found behavior.
   At narrow widths, offer List/Grid rather than claiming touch editing support.

### Bottom tray

- A bottom component styled like the design's floating tray; collapsible and
  vertically resizable. Open by default when a board has no placements.
- Header: Current label / All library scope, search, label filter when browsing
  All library, source filter, Needs review, sort, and collapse control. Include
  clear active-filter and reset states.
- Scrollable card grid with paginated loading. Fetch bounded previews and reuse
  existing source, search, and review semantics; do not load the whole library.
- Proposed sort choices: Newest / Oldest when browsing; Best match during
  full-text search. Clearing a search restores the chosen chronological sort,
  initially Newest. Search ordering is an explicit review point below because
  the current Convex search API returns relevance order.
- Current-label browsing is newest **saved item** first, not most recently
  assigned label first. If existing link indexes cannot provide this order,
  extend the indexed projection; do not sort just the loaded page and imply
  globally correct ordering.
- In All library, a single additional label filter limits results without
  changing which label owns the open board. Current-label scope is already
  label-filtered. Applying filters never hides, moves, or removes placed cards.
- Both placed and unplaced items remain discoverable. “On this board” identifies
  placed items, whose Locate action centers and selects their existing card.
  Dragging one again cannot create another placement.
- A valid drop shows a clear preview and uses canvas coordinates at the current
  pan/zoom. Dropping on a column inserts at the indicated stack position.
  Cancelling or dropping outside the canvas has no library or board effect.
- Provide an Add to board action as an alternative to drag, placing at the
  visible canvas center. Library-empty, filter-empty, loading, load-more, and
  retry states are distinct.
- Tray geometry/preferences are local UI state per board; viewport is saved
  server-side. A saved closed-tray preference may be reopened manually.

### Item cards

- Render saved media, source metadata, title, and a bounded text preview. Notes
  use their saved text. Reuse current display-title and source helpers.
- Use the first available attached image or stored asset URL in v1; show video
  posters when available. No new upload, download, scraping, image carousel,
  archived video playback, or media-selection feature is implied.
- Image above text in combined mode. Truncate overflowing title/body visibly;
  retain the full original content in the library and inspector. Card previews
  must never modify the item to achieve truncation.
- Store display mode and geometry per placement, allowing the same item to look
  different on different label boards. Text itself and image assets remain item
  data. New metadata can refresh the preview without changing saved geometry.
- Proposed default content regions: 300px card width, 200px image region, 120px
  text region, measured including each region's padding; text-only starts with
  the same 120px text region, and image-only with the 200px image region. Derive
  borders, padding, and typography from the design tokens.
- Combined mode without an image falls back to the same-sized text region,
  without a large empty image placeholder. A failed image shows a restrained
  fallback inside its image region. Image-only is unavailable if no image is
  attached; if an existing image disappears, fall back visibly to text-only.
- Resize width and height independently; aspect ratio is not locked. Persist
  image/text region heights so switching modes preserves the same text-region
  size instead of stretching text to fill an abandoned image region. Resizing
  combined mode scales its two regions proportionally; resizing a single-region
  mode changes that region. Proposed minimum: width 160px, each visible region
  80px. The text region does not grow automatically with content.
- Images fill their region with cropping and preserved aspect ratio. Display
  options in v1 are Combined / Image only / Text only; no text style controls.
- Single-click selects, Shift-click toggles selection, and double-click opens
  the existing inspector via `item=<id>`. Keep a visible Open details action.
- Selection toolbar/context menu supplies details, display mode, connect, and
  Remove from board. Existing inspector deletion remains the explicit library
  deletion path; Delete on the canvas removes placements only.

### Note creation

New note opens a dialog with a plain-text field, Create, and Cancel. Require
nonblank input, preserve original whitespace, and enforce the existing 100,000
character text limit. Submit explicitly as a note even if the entered text looks
like a URL. Do not expose a nonfunctional scraping option.

Create saves the library item, manually includes the current label, and creates
its placement in one transaction. Use a capture/operation key so retries cannot
duplicate the note. A toolbar-created note appears at the visible canvas center;
if invoked for a column, insert at the selected position. Failed creation leaves
the dialog and draft available for retry. Cancelling creates nothing. Existing
automatic labeling may run normally, but cannot remove the deliberate current
label or automatically place the item on other boards.

### Columns and headings

- Columns have a board-only editable title, canvas position, resizable width,
  and an ordered list of item placements. They do not assign library labels.
- Stack cards with design-consistent gaps; column height derives from the stack.
  Cards share the column's inner width, but their heights remain independently
  resizable. Dropping cards into/between columns supports reorder with an
  insertion indicator. No nested columns or headings inside columns in v1.
- Moving a column moves its contents and attached connections as a unit. Save
  the item's previous free-standing dimensions before entering; moving between
  columns retains that memory. Leaving restores those dimensions at the drop
  location. A card added directly to a column uses default free-standing size
  as its restoration size.
- **Provisional column deletion rule:** remove only the container, retain cards
  at their computed canvas positions and current displayed dimensions, and keep
  connections. Undo restores the column, order, and child geometry. This rule is
  explicitly eligible for a future product revision.
- If a multi-selection explicitly includes both a column and one of its cards,
  remove that card's placement as requested; otherwise deleting only the column
  preserves its children. Deduplicate grouped movement to prevent double moves.
- Headings are movable board-only text elements, created/renamed through their
  control or dialog. Use the design's heading typography; fixed styling in v1.
  Editing a heading or column title is organizational metadata editing, not
  editing a saved library note. Neither becomes a library item.

### Connections

Connections link two item placements on the same board, remain attached through
movement/resizing/column changes, and render beneath cards. Use curved paths as
in the design. Support None / End / Both arrowheads, an optional plain-text label
(proposed limit 200 characters), and colors from the design palette.

Show attachment points when connecting or selecting rather than permanent
flowchart ports on every card. Reject self-connections and references to another
board. Proposed rule: one connection per unordered pair of cards, edited rather
than duplicated. Removing a card's placement removes its incident connections;
undo restores both when endpoints are still eligible. Connections do not change
item labels or feed the network graph automatically.

### Multi-select and undo/redo

Marquee, Shift-click, and Ctrl/Cmd+A within the focused canvas select board
elements. Group move and group remove operate as one action. Ctrl/Cmd+Z undoes;
Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Inputs retain their normal editing shortcuts;
Escape clears selection or cancels an in-progress interaction.

History covers adding/removing placements, moving/resizing, display modes,
columns and their contents/order, headings, and connection creation/edit/removal.
One completed drag/resize is one entry; pointer ticks are not entries. Proposed
history depth: the latest 100 actions per open-board session; reload resets it.
Pan/zoom, filters, selection, inspector state, and save status are not history.

Undo never deletes newly created library notes, reverses label assignments, or
restores an item deleted from the library. Undoing an All-library drop leaves the
new label assignment and makes the card unplaced. Redo/history replay validates
current ownership and membership and cannot reassign a removed label implicitly.
External membership/deletion changes invalidate incompatible history entries;
explain when an action is no longer available.

## Persistence and data contracts

### Architecture

Use controlled `@xyflow/react` nodes/edges, mapping application-owned board data
to custom item, column, and heading nodes. Application code owns the tray, ordered
column layout, operation history, and saving. React Flow supports
[custom nodes](https://reactflow.dev/learn/customization/custom-nodes),
[parent/child positioning](https://reactflow.dev/learn/layouting/sub-flows), and
[resize controls](https://reactflow.dev/api-reference/components/node-resizer).
Parenting alone does not implement ordered-column behavior. Implement history
without making paid Pro examples a dependency.

Keep the stored board model independent of React Flow internals. Never persist
library text, image binaries, DOM measurements, selection flags, or the entire
React Flow store into board records.

### Proposed schema contract

Names below are proposed interfaces for review, not implementation tasks.

| Entity             | Required data and invariants                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boards`           | `ownerId`, `labelId`, `revision`, `viewport: {x,y,zoom}`, timestamps. Owner/label pair has one board. Create lazily and idempotently. Board title comes from the label.                                                                                                                     |
| `boardElements`    | Stable element key, owner and board, discriminated type `item` / `column` / `heading`, canvas geometry, and type-specific fields. Item includes `itemId`, display mode, region heights, optional column key/order, remembered free-standing dimensions. Column/heading includes title/text. |
| `boardConnections` | Stable key, owner and board, source/target item-element keys, arrowheads, label, palette color. Both endpoints exist on that board.                                                                                                                                                         |

Index board lookups by owner/label; elements and connections by owner/board;
item placements by owner/item and owner/board/item; connections by endpoint for
bounded cleanup. Enforce pair/placement/connection uniqueness transactionally;
Convex indexes are lookup mechanisms rather than automatic unique constraints.
Element and connection keys survive undo restoration. Separate indexed rows
avoid one ever-growing layout document.

No automatic board-data migration or production mutation in this specification.
Existing labels/items require no backfill to become eligible for Board view.

### Reviewed transaction details

The implementation request approves the defaults in [the design reference](docs/design/boards.md).
Operation receipts are indexed by owner, board, session and sequence. Store an
exact canonical request fingerprint and acknowledgment; identical retry returns
the acknowledgment, different payload with the same identity fails. Receipts
expire after seven days and indexed bounded cleanup removes them. Expired retries
must pass expected-revision checks; an already committed operation is stale and
cannot replay. A no-op does not advance layout revision.

Each included membership has a generation (the link's stable id plus an optional
invalidation counter). Exclusion increments its counter transactionally. A new
inclusion cannot revive a placement from the prior generation. Reads and history
replay validate generation before exposing or restoring a placement. Cleanup uses
indexed bounded continuations and never stores item content.

Bounds: coordinates ±1,000,000; dimensions 80–10,000 (card width at least 160);
zoom 0.25–2; element keys/session ids at most 100 characters; organizational text
at most 200 characters; 100 elements/connections per atomic action, 512 KiB request
bytes, 50 rows per layout page, 20 previews per batch. Oversized actions fail
before writes. These are transaction limits, not a 100-card board limit.

### Proposed operations

| Operation              | Observable contract                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get/open board         | Verify owner and label; return metadata and bounded layout pages. Lazy creation is an explicit mutation, never a query write.                                                                            |
| Read board previews    | Batch eligible placement IDs, return bounded item previews/media references; never download full saved text for each card.                                                                               |
| Place item             | Verify all ownership; manually include current label if necessary; create one placement, optionally in a column, atomically and idempotently. Preserve existing label attribution when already included. |
| Create note and place  | Reuse capture validation, search projections, counters, and labeling scheduling; atomically create/reuse the note, label inclusion, and placement.                                                       |
| Apply layout operation | Validate expected revision, element types/geometry, column membership/order, and connections; atomically apply the complete operation and advance revision. Cannot modify library membership or content. |
| Set viewport           | Persist validated viewport separately from undo history and layout conflict revisions; avoid rewriting all elements.                                                                                     |
| Remove placement       | Delete placement and incident connections; leave library data and membership unchanged.                                                                                                                  |

Use shared backend helpers for capture and membership writes; do not invoke one
public mutation from another or duplicate the existing item-state invariants.
Avoid request waterfalls for logically atomic create/assign/place operations.
Return the acknowledged revision and operation identity so reactive echoes do
not overwrite newer optimistic edits. Retrying the same operation must not
repeat its effect.

### Membership and deletion lifecycle

An eligible card requires an existing owned item with the board label included.
Every membership writer, including manual removal and model reprocessing, must
preserve this invariant. Once membership is removed, remove the placement and
its connections; reassigning that label later leaves the item unplaced until the
user adds it again. Changing other labels has no placement effect.

Deleting an item removes placements/connections across its boards without
retaining a content snapshot. Use indexed, bounded cleanup compatible with the
existing deletion continuation. Reads hide invalid references immediately, even
while cleanup completes, and stale saves cannot resurrect them. If label deletion
is exposed later, it must also clean up its board; v1 does not introduce a new
label-delete feature.

### Saving, errors, and concurrent sessions

- Show local interaction immediately; save completed actions, not every pointer
  event. Proposed text/control edit debounce: 300ms; viewport debounce: 500ms.
- Saving indicates pending work; Saved means server acknowledgment, not merely
  a local state update. Couldn't save preserves pending changes and offers Retry.
- Serialize local operations. Failed writes cannot let a later operation assume
  an uncommitted revision. Protect route changes/reloads with unsaved changes
  using the available browser/router mechanisms; do not claim durable offline
  recovery or guaranteed unload delivery.
- Prevent lost updates between two sessions belonging to the same owner with
  expected layout revisions. On conflict, stop pending layout writes and offer
  reload of the latest layout; never silently replace it with a stale snapshot.
  Retain the pending local draft until the owner explicitly reloads/discards it.
- Network loss displays the save error and disables committing further edits
  until retry/reconnection; current cards remain readable. Offline editing and
  collaborative merging are out of scope.
- Ownership/membership failures remove invalid content from view and cancel
  dependent operations/history. No missing/foreign-data distinctions leak.
- Paginate layout reads where necessary; do not show an incomplete layout as if
  it were complete. Bound mutations by bytes/documents; large group actions
  must either commit atomically within limits or reject without partial changes.

### Future compatibility

Treat board identity and content scope as separate application concepts. V1
resolves scope through an ordinary label; later independent boards can use
explicit membership, and virtual labels can supply computed membership without
rewriting canvas geometry or rendering.

Do not add unused virtual-label tables or union/intersection logic now. Whether
virtual labels combine by union, intersection, or another rule—and what dropping
an item onto their board should assign—belongs to that feature's future spec.
Never choose one constituent label implicitly. Independent boards must eventually
have their own spec for creation, naming, navigation, membership, and deletion.

## Tech stack

Installed: React/React DOM 19.2.3, Vite 8.3.2, TypeScript 6.0.3, TanStack Router
1.170.41, Convex 1.46.0, existing Clerk authentication, Tailwind 4.3.3, shared
shadcn/ReUI components, lucide-react 1.52.0. Vitest 5.0.3, Testing Library 16.3.3,
and convex-test 0.0.60 provide the existing test tools.

New authorized package choice: `@xyflow/react` in the web workspace. Resolve a
React-19-compatible stable version and pin it exactly when implementation starts;
it is not installed yet. No Pro subscription, force simulation, rich-text editor,
or second persistence service is required for v1.

## Commands

Run from the repository root; Node 24.12+ and pnpm 12.8.1.

```sh
# Development
pnpm dev:web
pnpm dev:backend

# Focused verification
pnpm --filter @mindspool/web test
pnpm --filter @mindspool/backend test
pnpm --filter @mindspool/web typecheck
pnpm --filter @mindspool/backend typecheck
pnpm --filter @mindspool/web build

# Documentation formatting (avoid rewriting the ignored design export)
pnpm exec prettier --write SPEC-boards.md CAPABILITY-MAP-web-redesign.md README.md
pnpm exec prettier --check SPEC-boards.md CAPABILITY-MAP-web-redesign.md README.md

# Backend contracts, on the selected development deployment after target verification
pnpm --filter @mindspool/backend codegen

# Final integration checks
pnpm check
```

There is no standalone lint command in the current repository. `pnpm check`
includes formatting, tests, typechecking, and builds. Read the installed Turbo
bundled docs before changing Turbo commands/configuration; this spec does not
change either.

## Project structure

```text
SPEC-boards.md                          Behavioral and technical contract
apps/web/src/boards/                    Board view, cards, tray, controls, state/history
apps/web/src/boards/*.test.ts(x)         Pure logic and component tests beside source
apps/web/src/routes/_app/labels.$labelId.tsx
                                       Label view switch; keep public route stable
apps/web/src/search/searchParams.ts     Typed layout/search normalization
apps/web/src/library/                   Reused capture/preview/feed helpers
apps/web/src/inspector/                 Existing item details, labeling, deletion
apps/web/src/shell/                     App/rail frame integration
packages/ui/src/styles/globals.css      Existing shared tokens
packages/backend/convex/boards.ts       Public owned board API
packages/backend/convex/boardState.ts   Shared invariants and bounded cleanup
packages/backend/convex/*.test.ts       Backend behavior tests
packages/backend/convex/schema.ts       New board indexes/tables
packages/backend/convex/validators.ts   Runtime board input/output validators
packages/schema/src/                   Platform-independent board types, if shared
docs/verification/boards.md             Runtime evidence and remaining checks
deisgn.html                            Local-only visual reference, gitignored
```

Names for new files are proposed; preserve current architectural boundaries.
Reuse existing UI primitives, theme tokens, and generated backend types.
Do not hand-edit generated router/Convex files or add a duplicate app shell.

## Code style

Use strict TypeScript, discriminated unions, descriptive names, named exports,
PascalCase components, camelCase helpers, and colocated tests. Prettier owns
formatting. Derive API types from generated Convex definitions; validate runtime
inputs on the server. Keep canvas transformations and history logic pure where
possible and separate from React rendering and network calls.

Illustrative style, not an additional API requirement:

```ts
type CardDisplayMode = "combined" | "image" | "text";

interface CardGeometry {
  width: number;
  imageHeight: number;
  textHeight: number;
}

export function visibleCardHeight(
  geometry: CardGeometry,
  mode: CardDisplayMode,
): number {
  if (mode === "image") return geometry.imageHeight;
  if (mode === "text") return geometry.textHeight;
  return geometry.imageHeight + geometry.textHeight;
}
```

Use existing component composition and token-based Tailwind styling. Dynamic
positions/dimensions are geometry values, not reasons to hardcode theme colors.
Render item/heading/connection text as text; no unsanitized HTML. Memoize custom
nodes and stable callbacks and avoid subscribing every component to the entire
nodes array, following the [React Flow performance guidance](https://reactflow.dev/learn/advanced-use/performance).

## Testing strategy

Meaningful behavior tests, not copies of implementation details; no arbitrary
coverage percentage requirement.

- **Pure logic:** canvas/drop coordinate conversion under pan/zoom, geometry
  and mode changes, column reorder/detach/deletion, group movement, history
  grouping, restoring incident connections, and membership-invalidated replay.
- **Components (Vitest/Testing Library):** layout URL validation, tray scope and
  filters, pagination states, existing-placement indicator/Locate, note-dialog
  validation and retry, selection/details actions, display options, save states,
  and text truncation preserving full data. Model controls at the application
  boundary; do not claim jsdom proves pointer geometry.
- **Backend (convex-test):** anonymous/foreign endpoint rejection, one board per
  label, one placement per board/item, atomic assignment/placement and note
  creation, duplicate retry handling, expected revision conflicts, invalid
  geometry/parents/connections, manual attribution preservation, item-state and
  counter invariants, all membership-removal paths, and bounded deletion cleanup.
- **Real desktop browser:** mouse/trackpad pan and zoom, drag from tray at several
  zoom levels, resize without changing original content, column reorder/detach,
  preserved-card column deletion, marquee/group moves, line endpoints, undo/redo,
  inspector overlays, reload restoration, retry and two-session conflict handling.
  Prefer the shared T3 preview browser when available.
- **Visual review:** compare against the local Claude export at 1440×900 and a
  smaller desktop viewport. Check rail, grid, fonts, shadows, card controls,
  expanded/collapsed tray, inspector clearance, and fallback media.
- **Performance:** proposed fixture of 100 cards, 10 columns, and 100 connections
  with mixed image/text previews. On a documented desktop/browser, aim for
  95th-percentile interaction frame time under 33ms after load during a 10-second
  pan/drag test. Record measurements and environment; do not infer performance
  from unit tests. Avoid per-pointer database writes and full-library reads.
  500 cards is a future benchmark, not v1 acceptance or a hard cap.

Record passing evidence and honest limitations in `docs/verification/boards.md`.
Run focused tests and typechecks during implementation and `pnpm check` before
claiming integration completion. The spec-writing task itself needs document
formatting and consistency checks, not an application test run.

## Boundaries

- **Always:** derive ownership from authenticated identity; verify every referenced
  label/item/board/element; enforce membership and uniqueness server-side; validate
  finite geometry, permitted modes/colors, text lengths, and bounded operation
  payloads; use indexed bounded reads; preserve capture/search/counter invariants;
  run appropriate checks; update this spec before changing agreed behavior.
- **Ask first:** change confirmed scope, undo semantics, or deletion behavior;
  add dependencies beyond the agreed React Flow package; introduce paid services,
  production changes/migrations, destructive backfills, or CI changes. Review
  the proposed board schema with this spec before implementation. Approved spec
  fields do not require repeated routine schema/dependency permission.
- **Never:** place items automatically, delete library items via canvas removal
  or undo, modify item content through preview truncation/display settings, treat
  columns as labels, silently discard unsaved work, resurrect removed membership,
  leak foreign data, commit the design export or secrets, hand-edit vendor/generated
  files, or remove failing tests to make verification pass.

## Success criteria

1. A label switches List → Board → Grid through typed URL state and browser
   history; its saved layout survives reload and label renaming.
2. A label with existing items first opens with zero placements and an open tray.
3. The tray defaults to the label, newest first, and provides All library, search,
   source/review/label filtering where applicable, sorting, and paginated loading.
4. Dropping an item at nondefault pan/zoom puts it at the previewed location;
   dropping into a column inserts at the previewed order.
5. Dropping an outside item atomically assigns the label and creates a placement;
   duplicate/concurrent/retried drops never create duplicate placements.
6. The same item may have distinct positions/sizes/modes on two label boards.
7. New note creates one library note with the current label and a placement;
   retry creates no duplicate; failure preserves the draft.
8. Default cards have equal text-region height with and without images, truncate
   previews, resize in both dimensions, and retain mode/geometry after reload.
9. Single-click selects; double-click opens the real inspector and full content.
10. Columns stack/reorder cards, determine their width, allow per-card height
    changes, move as a unit, and restore free-standing size on ordinary detach.
11. Deleting only a column preserves its cards at their current positions and
    connections; undo restores the group. The provisional rule is documented.
12. Headings and labeled/colored/arrowed connections persist; connections follow
    their endpoints and remain board-specific.
13. Multi-select operations and undo/redo behave as single logical actions and
    never delete notes or reverse library label assignments.
14. Removing placement leaves the item labeled and available in the tray;
    removing label membership or deleting the library item removes invalid cards
    and connections, including through model-driven membership changes.
15. Saved means acknowledged; failed saves retain pending changes for retry;
    stale-session writes produce a visible conflict rather than lost updates.
16. The initial 100-card performance fixture meets the reviewed target without
    loading the entire library or writing on every pointer movement.
17. The implemented visuals follow the Claude design tokens and Board section,
    with agreed extensions and deferred controls explicitly accounted for.
18. Ownership, atomicity, lifecycle, interaction, and integration checks pass;
    verification evidence is recorded, and `deisgn.html` remains gitignored.

## Open questions and proposed defaults for review

The main feature scope is settled. These choices were not separately approved
in the interview and remain visible rather than being treated as confirmed:

1. **Search ordering:** approve relevance/Best match during text search, with
   Newest/Oldest for browsing, or require globally chronological full-text results?
   The latter needs a different indexed search/query design. Do not silently
   sort only loaded results. Label browsing also needs saved-item creation time
   rather than label-assignment time.
2. **Geometry:** approve proposed 300px width, 200px image region, 120px text
   region, 160px minimum width, 80px minimum region height, proportional combined
   resizing, and preserved region sizes across display-mode changes. The design
   illustrates several sizes rather than defining a single default.
3. **Small defaults:** first image only, cropped image fit, fixed heading style,
   no duplicate/self connections, 200-character connection labels, 100-action
   session history, and 25–200% zoom are proposed for v1.
4. **Performance:** approve the initial 100-card fixture and measured 33ms frame
   target; agree on the recorded test machine when implementing.
5. **Column deletion:** already agreed but explicitly provisional. Revisit in
   a later feature revision; preserve this v1 behavior until then.
6. **Future features:** virtual-label combination and write semantics,
   independent-board contracts, and selected-text formatting/storage are deferred
   decisions, not blockers for the ordinary-label board.

After review, update this document with any changes and mark the spec approved.
Implementation planning begins in a later turn after approval.
