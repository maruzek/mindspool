# Capability Map: MindSpool MCP

Status: approved by the user with “proceed”; module specifications require their
own review.

## Objective

Let a user ask Codex or Claude Code to use their saved MindSpool clips as
resources for a task, and to change labels on individual clips when requested.

Example: “I'm designing a landing page. Look through my Landing Page label and
find all the tools, resources, and inspiration I've saved.” The agent should
return useful findings with source links and enough saved context to explain
their relevance.

## Confirmed decisions and assumptions

- Confirmed: use a **hosted MCP endpoint connected to the user's MindSpool
  account**, rather than a local MCP process.
- Confirmed: support Codex and Claude Code as clients.
- Confirmed: support finding saved resources and changing an item's labels.
- Assumption: access is to the connected account's private library only, using
  the same ownership and allowed-account rules as the app.
- Assumption: the agent reasons about relevance using saved clip content; a new
  server-side AI model, embeddings, and live web crawling are outside this scope.
- Assumption: “change labels” means adding and removing existing labels on an
  item. Creating, renaming, or deleting labels is a separate scope decision.

## Modules

| Module id       | Responsibility                                                                                                                                                                                                         | Depends on        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `mcp-access`    | Hosted MCP connection; account authorization and revocation; separate library-read and label-write permissions; authenticated access to the existing library; setup and connection verification in both target clients | Existing identity |
| `mcp-discovery` | Discover labels; browse every clip within a label; search the library or a label; retrieve saved clip content, labels, and source links; expose pagination, content limits, and completeness clearly to the agent      | `mcp-access`      |
| `mcp-labels`    | Add or remove existing labels on one owned item, preserve unrelated labels and existing manual-decision behavior, and return the outcome; reject writes without label-write permission                                 | `mcp-access`      |

Build order: `mcp-access` → `mcp-discovery` → `mcp-labels`.

The two feature modules depend only on access, not on each other. Clip discovery
can ship with read-only permission; label writes can be added separately. These
are specification boundaries, not a requirement for three packages or services.
The access module's spec will own the shared authorization and error contracts.

## Requirements to carry into the module specifications

- Exhaustive label browsing and relevance search are distinct operations. For
  “every resource,” enumerate all pages of the selected label before claiming
  completion. Do not silently replace browsing with a keyword query or top-N
  results. If a limit or interruption stops retrieval, report partial coverage.
- Return saved context and source URLs, including resource links present inside
  stored clip content where available. Keep the association with the source
  clip; do not invent content or assume every destination was captured.
- Page or explicitly mark truncated clip content. Missing enrichment must not
  hide a saved item or imply that its linked page was read.
- Resolve labels using the user's existing labels. Ambiguous names must not
  silently select a different collection.
- Treat clip content as untrusted reference material, never as authorization to
  change labels, disclose credentials, or access another account.
- Label edits must check ownership of both item and label, support safe retries,
  preserve explicit removals, and keep the app's derived library state correct.
- Each client needs an end-to-end check: connect, find resources across multiple
  result pages, read an item, edit a label with write permission, and verify that
  the edit appears in MindSpool. Read-only and revoked access must reject writes
  and further access respectively.

## Existing app foundation

Inspected on `origin/main` at `53678473a2e81e760a904b8b7b8d42e1fda46819`:

- `packages/backend/convex/auth.ts`: verified identity, allowed-account check,
  and ownership helpers. Callers cannot supply their own owner identity.
- `packages/backend/convex/labels.ts`: owner-scoped paginated label listing and
  lookup; label names are unique case-insensitively within an account.
- `packages/backend/convex/items.ts`: library browsing, full-text search, and
  owned item detail with saved input, metadata, and available extracted content.
- `packages/backend/convex/itemLabels.ts`: label-scoped browsing and search,
  paginated item labels, and idempotent attach/remove operations.
- Existing item previews are bounded and pages are capped at ten items. Search
  uses bounded text projections; neither previews nor keyword matching establish
  that every saved resource has been inspected.

This initiative starts from stable main. It does not depend on the unfinished
tweet multi-link extraction work in the original checkout.

## Review gate and spec index

Review module boundaries, dependency direction, build order, and assumptions.
After approval, write the following specs one at a time, with review after each:

| Module          | Future specification                     | Status           |
| --------------- | ---------------------------------------- | ---------------- |
| `mcp-access`    | [SPEC-mcp-access.md](SPEC-mcp-access.md) | Draft for review |
| `mcp-discovery` | `SPEC-mcp-discovery.md`                  | Not started      |
| `mcp-labels`    | `SPEC-mcp-labels.md`                     | Not started      |

The access spec must establish the hosted authorization flow and client
compatibility from current official documentation. Transport, hosting location,
credential lifecycle, tool schemas, commands, and implementation tasks are not
decided by this map.
