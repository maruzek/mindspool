# Analysis: MCP token efficiency

Date: 2026-10-17.
Inspected repository revision: `77dc8d5`.
Status: analysis and recommendations, preceding module specifications.

Source: [original proposal](mcp-token-efficiency.md).
Scope index: [capability map](../../CAPABILITY-MAP-mcp-token-efficiency.md).

## Findings from the implementation

| Evidence                                                                                                                                                          | Consequence                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `summaryOf` in `packages/backend/convex/mcp/discovery.ts` returns original-input `preview`, saved-text `snippet`, timestamps, type, enrichment, labels and counts | Discovery can use a smaller projection, but status and suggested membership cannot simply disappear                                    |
| `snippetOf` in `packages/backend/convex/mcpDiscovery.ts` always selects the first 120 characters after collapsing whitespace                                      | Search can return an irrelevant introduction even when useful matching text exists later                                               |
| `detailOf` in `packages/backend/convex/mcp/tools/shape.ts` returns up to 20,000 JavaScript string units of content and 4,000 of original input                    | Selecting an item can bring much more content into context than needed; original input can duplicate saved text                        |
| Continuations omit links and post relationships by default, but still return metadata, original input, labels and images                                          | A separate continuation projection can remove repeated overhead                                                                        |
| `getItem` in `packages/backend/convex/mcpDiscovery.ts` always reads child items and up to 101 label links                                                         | Output shaping alone does not avoid those database reads, even when resources are omitted from a continuation                          |
| `toolResult` in `packages/backend/convex/mcp/tools.ts` emits JSON text and `structuredContent`; `toolBytes` counts both plus escaping                             | The 64 KiB budget already covers the complete tool-result wrapper. Preserve that calculation; do not replace it with a character count |
| `withSnippets` reads saved item bodies, but uses `linkedItemStats` rather than hydrating children to count them                                                   | Keep count reads cheap; resource expansion must not reintroduce unbounded child-body hydration                                         |
| `extractTweetLinks` in `packages/backend/convex/tweetLinks.ts` skips already-saved URLs and creates children only for posts with at least two eligible links      | A source with no children may still contain useful resources; a source with children may have additional links without children        |
| `extractLinks` in `packages/schema/src/links.ts` returns at most 20 eligible unique links and skips X/Twitter/t.co destinations                                   | The extractor is not evidence that all URLs in saved source text were enumerated                                                       |
| `items.fromItemId` represents a single source; `items.by_owner_url_key` can resolve an already-saved URL                                                          | Read-time association is possible, but complete durable provenance is a separate data-model change                                     |
| Cursor encoding in `mcp/discovery.ts` binds operation and filters; ordinary pages contain at most ten items                                                       | Expanded output needs its own cursor state and output bounds, not just filtering the existing ten-row page                             |

Current behavior and prior client checks are documented in
[the discovery spec](../../SPEC-mcp-discovery.md) and
[the verification record](../verification/mcp-discovery.md). That record verifies
reading and browsing in both clients, but does not establish actual model-visible
token savings. No new benchmark or client check was run for this analysis.

## Assessment of the proposed improvements

| Idea                             | Recommendation                                  | Reason and design questions for its module spec                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compact browse                   | First scope                                     | Use one bounded useful excerpt with identity, title, URL and necessary state. Make richer fields explicitly available. Avoid a field-selection language for the first version                                                        |
| Progressive reads                | First scope                                     | Separate metadata, excerpt and full reading. Keep a large explicit window for tasks that actually need full text, rather than forcing every full read through tiny excerpts                                                          |
| Minimal continuations            | First scope                                     | Return identity, the requested stream window, continuation state and untrusted-content marking. Pass read intent into internal queries so labels and children are not fetched unnecessarily                                          |
| Duplicate input and URLs         | First scope, conservative                       | Omit text only when equality is established deterministically and the representation identifies what was omitted. URL identity equivalence alone does not prove that original URLs or distinct saved content are interchangeable     |
| Shared label context             | First scope                                     | Put the requested label at page level and preserve each row's confirmed/suggested membership state. Other labels can be optional; review semantics must remain visible                                                               |
| Match-centered search excerpts   | First scope                                     | Select a bounded passage deterministically from saved text. Specify case handling, multiword queries and fallback when the search index matches text absent from the full saved projection. Preserve ranking and `exhaustive: false` |
| Resource view                    | Separate first-scope module                     | Expand selected sources without claiming their resources are independently labeled. Keep source-only entries when expansion is unavailable, and unresolved link entries where capture is missing                                     |
| Global resource deduplication    | Deferred module                                 | One saved item can have multiple origins that are not recorded today. Deduplicating display rows is insufficient to establish complete attribution or stable cross-page uniqueness                                                   |
| Batch excerpt reads              | Defer pending measurement                       | A shared budget and per-item errors add interface complexity. Add only if task traces show selected-item calls dominate overhead after compact reads                                                                                 |
| Shorter transport representation | Investigate, preserve current wrapper initially | Client-visible context must be observed. Reducing wire bytes does not establish token savings and may remove the only usable representation for a client                                                                             |

## Additional improvements

**Protect content continuity.** Current offsets index the rendered saved text,
including a rendered Reddit capture. Text can change between calls. Consider a
content fingerprint returned with the first efficient read and supplied with
continuations, rejecting a changed stream with the existing `CONFLICT` domain
code. A fingerprint of the selected rendered text is more precise than a generic
item update timestamp, which can change for unrelated reasons. This protects
exact reassembly without requiring snapshot storage. Legacy calls can retain
their current behavior.

**Separate saved content from original input.** Unique commentary must remain
readable even when it is not in extracted content. The current original-input
field stops at 4,000 characters and has no continuation of its own. Consider
independently addressable `content` and `userInput` streams for the efficient
read contract, including offsets, totals and changed-content detection for each.
Do not call a truncated original-input preview access to all commentary.

**Account for tool discovery.** Extra tools, output schemas, descriptions and
response-mode switches also consume client context. Compare extending existing
tools with adding separate tools before choosing the public interface. Keep
ordering stable and instructions concise, while retaining the rules for exhaustive
browsing, partial captures and untrusted text. Avoid a general query language,
cryptic field abbreviations or per-client tool variants in the initial scope.

**Bound work as well as output.** Ten source posts can expand into 200 saved
children before considering links without children. Bound parent reads, child
reads, resource entries and serialized response bytes independently. A compact
response is not evidence of an inexpensive query. Database document reads still
include the persisted item body even if the handler returns only a small excerpt;
moving bodies into separate storage is a later optimization if measurements
justify a migration.

**Make all clipping explicit.** Preserve flags or continuations for excerpts,
source context, links, labels and resources. If an expansion stops at its budget,
continue within that source before advancing past it. A short or empty output
page cannot establish completion.

## Resource-view decisions that need a specification

The resource view should use the ordinary owned-item enumeration as its source
of scope. Source/review filters apply to those selected items; expansion into a
web resource must not discard it merely because its parent was selected using
`source: "x"`. Derived membership must be identified separately from direct
membership. An explicit exclusion of a destination from the requested label
must not be bypassed through a parent or another URL alias.

Prefer a source dictionary per page: each source appears once with its item ID,
URL and bounded commentary, while resources refer to it. Include source entries
on every page where their references are needed, so pages are independently
interpretable. Keep post text available through ordinary reading.

Compare source text links with known saved children and owner-scoped URL lookup.
A missing child is not proof that capture failed; it can mean duplicate capture
was skipped, a resource was deleted, or extraction never covered that link.
Report only observed states, and do not recreate deleted items during browsing.
Use explicit unresolved states instead of inventing failure explanations.

Expansion should retain a fallback representation for source text that has no
eligible resources, is missing, or cannot be fully scanned within the work
budget. Extraction caps and unsupported/shortened links need explicit coverage
limits. `page.isDone` means the selected enumeration finished; it must not imply
that every linked page was captured, every source post was read in full, or every
destination on the live web was discovered.

Page-local grouping may merge equal URL identities if it retains all observed
source references and distinct saved captures. Repeated URLs on later pages
remain permitted in the initial view. Do not carry an ever-growing set of seen
URLs in an opaque cursor, or announce library-wide unique coverage. Persistent
associations and a stable global enumeration belong to the deferred module.

## Alternatives

1. **Recommended: explicit efficient representations followed by resource view.**
   Existing calls remain compatible, response changes can be measured independently,
   and the resource view builds on tested bounds. Tradeoff: efficient modes need
   clear tool instructions so agents actually choose them.
2. **Make compact/excerpt output the new default immediately.** More automatic
   savings, but changes documented output fields and full-reading behavior.
   Consider only with an explicit versioning or migration decision.
3. **Implement durable provenance and global deduplication first.** Gives a stronger
   eventual resource model, but postpones simple payload savings behind writer
   changes, historical reconstruction and migration verification.

## Measurement recommendations

Capture a baseline before changing handlers, using a checked-in synthetic
collection and fixed tasks. Record client/version/model, prompt, tool arguments,
response representation and outcome. Compare equivalent scopes and evidence;
returning less relevant information is not an efficiency win.

Tasks should cover exhaustive label enumeration, selecting relevant resources,
search with a match deep in content, duplicate URLs from multiple posts, excerpt
selection followed by reading, full long-form reading, and original commentary
retrieval. Include independently unlabeled children, explicit exclusions, foreign
owners, deleted resources, incomplete captures, suggestions, more than twenty
links, Unicode and JSON escaping, and content changes between continuations.

Report separately:

- Model-visible tool-result tokens where observable, with tokenizer/model identity.
- Cumulative input usage and cached usage where available, without attributing
  unrelated agent reasoning changes to response shaping.
- Tool definitions and serialized response bytes, including the existing wrapper.
- Tool calls, end-to-end latency, backend read bytes/documents, resource coverage,
  retained attribution and correctness of the final task answer.

Use deterministic replay for payload comparisons and repeated client runs for
agent behavior. If a client does not expose its model-visible representation,
mark token savings unmeasured and report bytes as a proxy. Set numeric reduction
targets in the module spec as proposed targets, then verify them against the
baseline; no percentage is established by the present analysis. Require exact
text reassembly and zero unauthorized or silently omitted fixture results.

## Protocol compatibility

The official MCP tools specification recommends accompanying structured results
with serialized JSON text for backward compatibility. It also recommends
deterministic tool ordering to aid caching. These support retaining the wrapper
until actual client behavior is measured and considering tool-definition overhead
alongside response size. See the
[MCP tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
This is not a proposal to upgrade the project's SDK or protocol version.

## Next review

The user approved the capability map on 2026-10-17, retaining deferred provenance.
Review [the response-efficiency spec](../../SPEC-mcp-response-efficiency.md) next;
the resource-view specification follows review of that provider contract.
Implementation plans and product changes follow their own approval stages.
