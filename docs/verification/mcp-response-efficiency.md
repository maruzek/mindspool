# MCP response efficiency: verification

Date: 2026-10-18. Scope: the first three steps of
[the response-efficiency spec](../../SPEC-mcp-response-efficiency.md) as trimmed by
review: compact browse and search with match-centred excerpts, and progressive item
reads with stream versions, separate `content`/`userInput` streams and bare
continuations. Deferred: `contextUrl` link substitution, the app-query bypass for
compact rows, batch reads, the resource view and provenance.

## Deterministic results (synthetic fixtures)

Measured through the real MCP handler by `convex/mcpDiscovery.test.ts`
("efficiency gates"); `toolBytes` counts both transport copies. Fixtures are
synthetic: ten URL clips with 120+ character saved text and three labels each, and
one long item with 4,000 characters of distinct original input, metadata, five
images, four labels and 80,000 characters of content. These are byte proxies, not
measured model tokens.

| Measure                                             | Standard / legacy  | Efficient          | Change     |
| --------------------------------------------------- | ------------------ | ------------------ | ---------- |
| Ten-row browse page                                 | 13,640 B           | 8,842 B            | −35.2%     |
| Ten-row search page                                 | 13,680 B           | 8,882 B            | −35.1%     |
| Continuation overhead (result minus `content.text`) | 12,078 B           | 620 B              | −94.9%     |
| Full read of 80,000 characters                      | 4 calls, 208,460 B | 4 calls, 165,994 B | −20% bytes |

Gates met: at least 25% on compact pages with identical IDs and order, at least 75%
continuation overhead, no more calls or bytes for a full read, exact text
reassembly. The continuation figure uses a fixture chosen to be metadata-heavy; real
clips with little metadata will save less.

Other behaviour covered by tests: unchanged standard output and cursors;
representation-bound cursors; requested-label `suggested` beyond a three-label
sample; excerpt boundaries, case folding and surrogate pairs; both streams
reassembled exactly (including original input over 4,000 characters); stale,
wrong-stream and malformed versions; past-end and mid-pair offsets; invalid
parameter combinations; no label/child/parent reads on a bare continuation;
indistinguishable foreign and malformed ids; oversized metadata within 64 KiB.

## Not yet verified

- Token savings in Codex and Claude Code, `tools/list` size growth from the added
  parameters and descriptions, and whether agents choose `format: "compact"` and
  `mode` unprompted. None has been measured; the byte figures above are only proxies.
- Compact rows still go through the shared preview query (thumbnail resolution and
  label hydration); only the response shape is smaller. Backend read cost is unchanged.
- Latency against a deployed Convex backend.
