# MCP token-efficiency proposal

Date: 2026-10-17.
Status: proposal recorded for future work; no API or implementation change.

## Objective

Reduce the model-visible tokens and tool calls needed to discover useful saved
resources, while preserving exhaustive browsing, source attribution, unique user
commentary and access to full saved content.

The existing contract is described in [MCP operations](../mcp.md) and the
[discovery spec](../../SPEC-mcp-discovery.md). Names and response modes below are
proposals, not currently supported parameters.

## Collapse source tweets in a resource view

Offer an explicit `view: "resources"` that expands source posts into their saved
resources and represents the source post once as attribution. For example, a
tweet containing five tool links could produce five resource entries referencing
one source tweet. The agent could fetch the tweet's full text when its commentary
matters.

Keep ordinary item browsing available for requests to inspect every saved item.
Do not silently change its meaning or claim resource-view coverage is coverage of
all original posts and their text.

Implementation must address these existing behaviors:

- Extracted items do not inherit the source tweet's labels. A resource view must
  expand labeled parents; filtering tweets out would otherwise hide resources.
- Extraction can skip an already-saved URL. A nonzero child count does not prove
  every link in the tweet is represented by a child item.
- Source commentary can contain unique information beyond the links. Keep a
  bounded context excerpt when useful and retain an explicit route to the source.
- Missing, failed or incomplete resource captures must remain visible as such;
  they must not cause a source post to disappear without representation.
- Ownership and label exclusions must remain enforced. Resources discovered via
  a labeled parent must not be presented as independently belonging to that label.

Pagination must account for parent expansion and any deduplication. Completion
must describe the selected view accurately, including any unresolved resources;
neither a short page nor filtering out a parent proves completion.

## Other opportunities

| Priority | Improvement                        | Proposed behavior and tradeoff                                                                                                                                                                                   |
| -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First    | Compact browse responses           | Return ID, title, URL and one short excerpt. Browse currently returns both original-input `preview` and `snippet`, plus metadata that many discovery tasks do not need. Keep richer fields available on request. |
| First    | Progressive content retrieval      | Offer metadata, excerpt and full-content modes. Start with bounded excerpts rather than automatically returning up to 20,000 characters. Preserve explicit full reading and honest continuation offsets.         |
| First    | Minimal continuations              | Return item ID, the next content window and continuation state. Continuations already omit resources by default, but repeat labels, metadata and up to 4,000 characters of original input.                       |
| Next     | Remove duplicated text and URLs    | Omit original input when it duplicates saved content, and avoid repeating identical original/canonical URLs across fields. Preserve distinct user commentary and distinct URLs.                                  |
| Next     | Deduplicate resources across posts | Return one entry per canonical URL with references to its source posts. Complete provenance is required; the current single-parent relationship alone cannot represent every origin.                             |
| Next     | Share label context                | Identify the requested label once at page level. Include other labels only when requested, while retaining suggestion/review information when relevant.                                                          |
| Next     | Search excerpts around matches     | Show a relevant passage instead of only the beginning of saved text, helping the agent select items without reading each one in full. Search must remain explicitly non-exhaustive.                              |
| Later    | Bounded batch reads                | Fetch excerpts for several selected IDs under one shared response budget. This primarily reduces tool-call overhead; it does not inherently reduce the amount of content needed.                                 |

## Investigate duplicate transport representations

The current tool-result wrapper includes the same JSON in a text content block
and in `structuredContent`. This duplicates serialized bytes, but the effect on
model context depends on how each client consumes the result.

Measure the actual model-visible representation in Codex and Claude before
changing compatibility behavior. Evaluate whether a shorter text representation
can accompany the structured result without making either client lose useful
information. Do not equate a wire-byte reduction with an identical token saving.

## Recommended first package

1. Compact browse responses with one useful excerpt and optional richer fields.
2. Excerpt-first reading and minimal continuation responses.
3. An explicit resource view that collapses source tweets while preserving
   provenance, unique commentary and honest coverage.

Use deterministic shaping first. New AI-generated summaries would add model cost
and introduce their own information-loss and correctness questions.

## Measurement and acceptance

Compare the current and proposed behavior on the same saved collection and tasks:

- Enumerate all resources in a label, including resources from labeled tweets
  whose child items are not independently labeled.
- Select relevant items and read their supporting content.
- Follow duplicate URLs appearing in multiple posts without losing attribution.
- Read long items through continuation and reconstruct their full text exactly.

Record model-visible tokens where observable, serialized response bytes, tool
calls, latency, resource coverage and access to source context separately. Test
both clients. Include unique tweet commentary, already-saved links, incomplete
captures, ownership restrictions and label exclusions in the fixtures.

Adopt changes only when measured efficiency improves and the selected view's
coverage remains correct. Exact savings are not yet measured. Silent omissions,
loss of provenance and presenting partial coverage as complete are unacceptable.
