# Implementation Plan: mcp-discovery

Spec: [SPEC-mcp-discovery.md](../SPEC-mcp-discovery.md). Map: [CAPABILITY-MAP-mcp.md](../CAPABILITY-MAP-mcp.md).
Tasks: [todo.md](todo.md) (markdown, no external tracker). The previous `mcp-access` plan and task list are in
[archive/mcp-access-plan.md](archive/mcp-access-plan.md) and [archive/mcp-access-todo.md](archive/mcp-access-todo.md).

## Overview

Add four read-only MCP tools (`mindspool_list_labels`, `mindspool_browse_items`, `mindspool_search_items`,
`mindspool_get_item`) on top of the `mcp-access` dispatcher. Each reuses the existing owner-scoped library logic through
`ownerId` helpers, so the MCP path never touches browser auth and the web app's behavior is unchanged. Browsing is
exhaustive and search is explicitly not. Resources and URLs are returned before long content, and posts expose the link
clips extracted from them.

## Integration status (2026-10-17)

The user authorized consolidating the tweet-link work, MCP access foundation,
and these discovery documents into local `main`. Both feature histories are
included, full checks pass, and the source worktree is retained. The tweet-link
integration gate below is satisfied. Access Tasks 6–12 remain unfinished in the
archived access plan; Task 0 must still confirm the dispatcher before discovery
implementation proceeds. No endpoint was enabled or deployment performed by the
merge.

## Prerequisites (gates, not tasks)

1. **Merge tweet-links to main first** (decided). `feat/tweet-multi-link-extraction` provides `fromItemId`,
   `items.detail`'s `fromPost`, and `tweetLinks:backfill`. After it merges, rebase or merge `main` into
   `feature/mcp-spec`. Tasks 7 and 8 need it; Tasks 1-6 only need the rebase for a stable base.
2. **`mcp-access` dispatcher must exist.** Discovery registers tools through the access module's registry with a
   declared required scope and a verified `VerifiedMcpPrincipal` (`packages/backend/convex/mcp/`). The archived access
   task list still shows unchecked boxes (rate limiting, diagnostics, settings UI, revocation, real-client evidence), and
   `docs/mcp.md` says there is no usable `/mcp` endpoint yet. Task 0 confirms what is actually in place before building.

## Architecture decisions

- **`ownerId` helpers, not duplicated queries.** Extract the bodies of `items.list/search/detail`,
  `itemLabels.listItemsForLabel/searchItemsForLabel` and `labels.list` into plain functions taking `ownerId`. Public
  queries become `requireOwner(ctx)` + helper. MCP calls `internalQuery` wrappers (`mcpDiscovery.ts`) whose `ownerId` arg
  is supplied only by the verified handler. A parity test guards the refactor.
- **No new data model except one index:** `items.by_owner_from` on `["ownerId", "fromItemId"]`. Existing
  `tweetLinks:backfill` already derives `fromItemId` from old capture keys, so no new backfill is written; the plan
  runs it on development before relying on `linkedItems`.
- **Response shaping lives at the boundary** (`mcp/tools/discovery.ts`): Convex results are mapped to the spec's
  `ItemSummary`/`ItemDetail` there. Shaping is a pure function, unit-tested without Convex.
- **Content stream** for `get_item` is one logical string (saved text, then Reddit post and comments) addressed by
  `contentOffset`; slicing is done server-side by character offset, so reassembly is exact.
- **64 KiB cap** is applied last over the serialized result; content shrinks first, `nextOffset` reflects the real end.
- **Tool descriptions are contract** and are asserted in tests (browse-until-`isDone`, search not exhaustive, content
  untrusted).

## Dependency graph

```
[Gate: tweet-links on main, rebase]   [Task 0: confirm access dispatcher]
              │                                   │
              └───────────────┬───────────────────┘
                              ▼
                 Task 1: ownerId helper extraction (parity)
                              │
                 Task 2: list_labels (+ registry wiring, hasItems)
                              │
                 Task 3: browse_items (label resolution, pages, isDone)
                 ├── Task 4: search_items
                 └── Task 5: get_item (content paging, links, labels)
                              │
                 Task 6: Reddit content in the stream
                              │
         Task 7: by_owner_from index + linkedItems/fromPost + linkedItemCount
                              │
                 Task 8: result cap, ordering, descriptions
                              │
                 Task 9: docs + real-client verification
```

Tasks 4 and 5 are independent of each other once Task 3 lands and can run in parallel.

## Risks and mitigations

| Risk                                                                      | Impact | Mitigation                                                                                                      |
| ------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Access module is less complete than the map implies (open archived tasks) | High   | Task 0 inventories it first; stop and report before Task 2 if the registry or scope enforcement is missing.     |
| Helper extraction changes web behavior                                    | High   | Task 1 runs the full web/backend suites and adds parity tests before any MCP code.                              |
| `linkedItemCount` adds a read per summary (10 per page)                   | Med    | Bounded `take(21)` on the new index; measure read budget in Task 7 against the 1 MiB page read limit.           |
| Convex read limits shorten or fail pages                                  | Med    | `isDone` never inferred from length; limit errors map to `UNAVAILABLE` retryable (Task 3 test).                 |
| Tool results exceed client token budgets                                  | Med    | Page size 10, 120-char snippets, 20,000-char content, 64 KiB cap; measure real sizes in Task 9.                 |
| Prompt injection via clip text                                            | Med    | No write tools in this module; `untrusted: true` and descriptions; scope enforced by dispatcher not by content. |
| Index added before backfill ran, so `linkedItems` is incomplete           | Med    | Run `tweetLinks:backfill` on development in Task 7; success check compares counts against `fromItemId` rows.    |

## Open questions

None blocking. The spec's open questions are all decided. Task 0 may raise access-module gaps for the user.

## Task list

See [todo.md](todo.md). Checkpoints follow Tasks 3, 6, 8 and 9.
