# Capability Map: MCP token efficiency

Date: 2026-10-17.
Status: module boundaries approved by the user on 2026-10-17. Module specifications
require their own review.

## Objective and assumptions

Reduce the model context and tool calls needed to find useful saved resources
in Codex and Claude Code, preserving source context, access controls and honest
coverage. Start with deterministic shaping of existing saved data.

Working assumptions retained from the proposal:

- Existing tool calls retain their current behavior unless the caller opts into
  a new representation. Changing defaults needs an explicit migration decision.
- No new AI summaries, embeddings or live destination fetching.
- Response efficiency and resource browsing are the first delivery scope.
- Persistent many-to-many provenance and library-wide deduplication are deferred.
- Efficiency is measured across a complete task, including discovery schemas,
  responses and follow-up reads; serialized bytes are reported separately.

## Modules

| Module id                 | Responsibility                                                                                                                                                                              | Depends on                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `mcp-response-efficiency` | Compact browse/search projections, deterministic match excerpts, progressive reading, minimal continuations, mode-aware internal reads, and repeatable efficiency comparisons               | Existing `mcp-discovery` and `mcp-access` |
| `mcp-resource-view`       | Explicit resource browsing that expands selected source posts, shares source context within a page, represents unresolved links and preserves ownership, exclusions and accurate pagination | `mcp-response-efficiency`                 |
| `mcp-resource-provenance` | Durable associations between a resource and multiple source posts; bounded provenance retrieval and backfill; unique-resource browsing across pages                                         | `mcp-resource-view`; deferred             |

Approved build order: `mcp-response-efficiency` → `mcp-resource-view`.
Later: `mcp-resource-provenance`.

These are specification boundaries within the existing backend, not new services.
The response module owns projections, budgets, content windows and measurement.
The resource-view module owns expansion, source references and view coverage.
The provenance module owns durable associations and global deduplication.
Each spec must establish the contracts its dependent module consumes.

## Review context

The [analysis](docs/design/mcp-token-efficiency-analysis.md) compares all ideas in
the original proposal with the implementation, identifies additional improvements
and records alternatives and risks. Recommendations there are provisional.

Keeping global deduplication separate avoids making compact output depend on a
data migration. A resource view can report repeated URLs and known source
relationships accurately before complete historical provenance exists.

## Spec index

| Module                    | Specification                                                      | Status                                                  |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `mcp-response-efficiency` | [SPEC-mcp-response-efficiency.md](SPEC-mcp-response-efficiency.md) | Draft awaiting review                                   |
| `mcp-resource-view`       | `SPEC-mcp-resource-view.md`                                        | Next specification, after response specification review |
| `mcp-resource-provenance` | `SPEC-mcp-resource-provenance.md`                                  | Deferred; not required for the first scope              |

Approval here accepts the module boundaries and scope. It does not approve
implementation, new dependencies, schema migration or deployment.
