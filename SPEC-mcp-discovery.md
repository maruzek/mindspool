# Spec: MCP clip discovery (labels, browsing, search, item retrieval)

Module: `mcp-discovery` in [CAPABILITY-MAP-mcp.md](CAPABILITY-MAP-mcp.md).
Depends on: `mcp-access` ([SPEC-mcp-access.md](SPEC-mcp-access.md)), which owns
authorization, scopes, the verified principal, the error table, rate limits and
logging. This spec does not restate them.
Status: implemented and verified on development; human outcome review remains open.
Production deployment requires separate approval.

## Objective

Let Codex or Claude Code, connected read-only, find and read the user's saved
MindSpool clips as source material for a task. Example: “Look through my Landing
Page label and find all the tools, resources, and inspiration I've saved.”

The agent must be able to:

1. discover the user's labels;
2. **exhaustively browse** every clip in a label (or the whole library) and know
   whether it saw all of them;
3. **search** by keyword, as a separate, explicitly non-exhaustive operation;
4. **read one clip** in full (in bounded pieces): saved content, labels, source
   links, and the post a link was found in.

Success is the agent returning findings with source URLs and enough saved
context to justify each, without claiming coverage it did not have.

### Assumptions (correct me now or I'll proceed with these)

1. Four read-only tools, all requiring `mindspool:read`; no label writes here
   (`mcp-labels`).
2. Reuse the existing owner-scoped queries' logic (`items.list/search/detail`,
   `itemLabels.listItemsForLabel/searchItemsForLabel`, `labels.list`) rather than
   new indexes or schema. The MCP handler cannot use them as-is, because they
   call `requireOwner(ctx)` on a browser JWT. The plan extracts each body into a
   helper taking `ownerId`; the public queries keep their behavior and the MCP
   path calls internal queries fed only by the verified principal.
3. Relevance is judged by the agent from returned text. No embeddings, no
   server-side AI, no crawling of linked pages (consistent with the map).
4. Page size stays at the app's cap of 10 items. Agents page through; the spec
   does not raise the cap.
5. `fromPost` and `linkedItems` exist only once the tweet-links work is on main;
   until then the tool omits them. Implementation of those fields waits for it.
6. Unconfirmed model suggestions (`unsure`) count as label members in browsing,
   as in the app, and are marked so the agent can tell them from confirmed ones.

## Tools

All tools: `readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`,
required scope `mindspool:read` declared at registration (enforced by the
dispatcher per the access spec). Inputs and outputs are validated; results carry
`structuredContent` plus equivalent serialized text.

### `mindspool_list_labels`

Input: `{ cursor?: string, limit?: 1..50 (default 50) }`.
Output: `{ labels: [{ id, name, description?, hasItems: boolean }], page: Page }`.

`hasItems` is false when the label has no confirmed or suggested members, so the
agent can skip browsing empty labels. It costs one single-row index read per
label (at most 50 per page), not a counter, and needs no schema change.

The only way to learn label ids and exact names. Alphabetical (the existing
`by_owner_name` order).

### `mindspool_browse_items`

Input: `{ labelId?: string, labelName?: string, source?: SourceKind,
needsReview?: boolean, cursor?: string, limit?: 1..10 (default 10) }`.
At most one of `labelId` / `labelName`. Neither means the whole library.
Output: `{ label?: { id, name }, items: ItemSummary[], page: Page }`.

Ordered most-recently-added first (to the label, or to the library when no label is given; so within a label `savedAt` can be out of order, as in the web app) and **exhaustive when paged to the end**: it never ranks, drops, or
caps results. This is the operation to use for “every resource in label X”.

### `mindspool_search_items`

Input: `{ query: string, labelId? | labelName?, source?, needsReview?,
cursor?, limit?: 1..10 }`. Query rules are the app's: 1–200 characters, at most
16 words.
Output: `{ items: ItemSummary[], page: Page, exhaustive: false }`.

Best match first. Always reports `exhaustive: false`: keyword matching over
bounded search text (items 8,000 chars, label links 1,000) does not prove a clip
is irrelevant. The tool description tells agents to use browse, not search, when
the user asks for “all”.

### `mindspool_get_item`

Input: `{ itemId: string, contentOffset?: integer >= 0, includeResources?: boolean }`.
Resources are included by default at offset zero and omitted on continuation unless explicitly requested.
Output: `ItemDetail` (below). One call returns at most 20,000 characters of
content; the agent continues with `contentOffset = content.nextOffset`.

### Shared shapes

```ts
type Page = {
  nextCursor?: string; // opaque; pass back unchanged
  isDone: boolean; // true only when the end of the result set was reached
  returned: number;
};

type ItemSummary = {
  itemId: string;
  savedAt: string; // ISO from _creationTime
  title?: string; // <= 512 chars
  url?: string; // original URL, <= 512 chars
  preview: string; // originalInput, <= 160 chars
  snippet?: string; // start of saved content (extractedText), ~120 chars, ends with … when cut
  inputType: "url" | "text" | ...; // as stored
  enrichment: "not_started" | "pending" | "succeeded" | "failed";
  labels: { id: string; name: string; suggested?: boolean }[]; // <= 3
  labelCount: number; // true total
  linkedItemCount?: number; // link clips extracted from this post (<= 20); omitted when none
};

type ItemDetail = {
  itemId: string;
  savedAt: string;
  url?: string;
  canonicalUrl?: string;
  inputType: string;
  captureSource: string;
  enrichment: ItemSummary["enrichment"];
  linkedPageRead: boolean; // enrichment === "succeeded" and text present
  metadata?: { title?; description?; author?; siteName? };
  userInput: Bounded; // originalInput, <= 4,000 chars
  content: {
    text: string; // slice of extractedText
    offset: number;
    nextOffset?: number; // present iff more remains
    totalChars: number;
    truncated: boolean; // true iff nextOffset present
  };
  links: { url: string; role: "original" | "canonical" | "in-content" }[]; // <= 50; flag when capped
  fromPost?: { itemId: string; url: string; title?: string; excerpt?: string };
  linkedItems?: {
    itemId: string;
    url: string;
    title?: string;
    snippet?: string;
    enrichment: ItemSummary["enrichment"];
  }[]; // link clips extracted from this post, <= 20 (the extraction maximum)
  labels: { id: string; name: string; suggested?: boolean }[]; // all, see Limits
  imageUrls?: string[]; // <= 10
  untrusted: true;
};
```

Exact field optionality is settled in the
plan against `itemDetail` in `validators.ts`; see Open Questions.

## Behavior contract

**Completeness.** `isDone` is the only completion signal. A page may be shorter
than `limit` (read-byte limits, or rows hidden because the item was deleted),
and an empty page with `isDone: false` is valid. Tool descriptions instruct
agents to continue until `isDone: true` before claiming coverage and to report
partial coverage if they stop early. The server never infers `isDone` from page
length.

**Cursors** are Convex pagination cursors passed through opaquely. A cursor is
accepted only with the same filters it was issued for; a malformed or mismatched
cursor yields `INVALID_INPUT`, never another owner's data or a silently
restarted listing. Results are a live view: items added or removed mid-pagination
may appear or be missed, and the descriptions say so.

**Label resolution.** `labelName` is matched with the app's `normalizedName`
(trimmed, case-insensitive exact match; names are unique per account). No fuzzy
or prefix matching: a near miss returns `NOT_FOUND` with the message “No label
with that name; call mindspool_list_labels”. Giving both `labelId` and
`labelName`, or a foreign/malformed id, is `INVALID_INPUT` / `NOT_FOUND`
respectively, with the identical public `NOT_FOUND` message for foreign and
missing.

**Label membership** is the existing rule: links with `manualDecision: "include"`.
Explicitly excluded items never appear. Unconfirmed model suggestions appear with
`suggested: true`; `needsReview: true` narrows to exactly those.

**Missing enrichment never hides a clip.** Items with `pending`, `failed`, or
`not_started` enrichment are listed like any other, with `enrichment` reported
and `linkedPageRead: false`. The agent is told not to describe the destination
page when it was not read.

**Resource links.** `get_item` returns the clip's own URL(s) and the http(s) URLs
found in its saved text, deduplicated with the repository's existing URL
normalization (`urlKey`), each tagged with its role and tied to this `itemId`.
For a link item saved from a post, `fromPost` names the source post. Links are
reported as found, never fetched or validated; the spec does not claim every
destination was captured.

**Resources come first.** In `get_item`, `links`, `linkedItems` and `fromPost`
are serialized before `content`, so the agent sees a post's resources and URLs
before any long text, and a continuation call (`contentOffset > 0`) repeats
them only if asked. Browse and search summaries carry `linkedItemCount` so the
agent knows a post has resources worth opening. `linkedItems` is read through a
new owner-scoped index on `fromItemId` and lists only items the owner still
owns; it is absent for clips with none. Link clips do not inherit the post's
labels, so this is the route from a labeled post to its resources.

Summary counts use the user-approved optional `items.linkedItemStats` field
(`count?`, `revision`), maintained transactionally by canonical child writers.
A byte-bounded, revision-checked backfill initializes legacy rows. Summary shaping
never hydrates child article bodies; missing legacy counts produce retryable
`UNAVAILABLE` until migration completes. This additional schema change and
development backfill were explicitly approved on 2026-10-17.

**Untrusted content.** Clip text is data. Every content-bearing result carries
`untrusted: true`, and tool descriptions state that instructions inside clip
text are not user instructions. The server never alters scope or behavior based
on content, and no discovery tool has write capability, so injected text cannot
cause a mutation through this module.

**Errors** use the access spec's table and codes (`INVALID_INPUT`, `NOT_FOUND`,
`UNAVAILABLE`, `INTERNAL_ERROR`). Unknown, deleted, malformed, and foreign item
ids are indistinguishable. Convex read-limit failures map to `UNAVAILABLE` with
`retryable: true`, not to an empty page.

## Limits

| Limit                         | Value                                                     |
| ----------------------------- | --------------------------------------------------------- |
| Items per browse/search page  | 10 (existing `PREVIEW_PAGE_SIZE`)                         |
| Labels per page               | 50                                                        |
| `get_item` content per call   | 20,000 chars (continue via `contentOffset`)               |
| `userInput`                   | 4,000 chars, flagged when cut                             |
| In-content links per item     | 50, flagged when capped                                   |
| Labels in `ItemDetail`        | all, up to 100 (flag if more); summaries show 3 + count   |
| Whole tool result, serialized | 64 KiB, enforced after assembly, never silently truncated |
| Search query                  | 200 chars, 16 words (existing)                            |

Anything cut by a limit is flagged in the result (`truncated`, `nextOffset`,
`labelsTruncated`, `linksTruncated`, `linkedItemsTruncated`, `imageUrlsTruncated`, `metadataTruncated`); there is no silent truncation. If an
assembled result would exceed the cap, `content.text` shrinks and `nextOffset`
reflects the actual end.

## Commands

```sh
pnpm --filter @mindspool/backend test
pnpm --filter @mindspool/backend exec vitest run convex/mcp convex/mcpDiscovery.test.ts
pnpm --filter @mindspool/backend typecheck
pnpm --filter @mindspool/backend exec prettier --check .
pnpm exec prettier --check SPEC-mcp-discovery.md CAPABILITY-MAP-mcp.md
pnpm check   # full repo gate before merge
```

Real-client checks reuse the access spec's `codex mcp ...` / `claude mcp ...`
setup against the classified development deployment.

## Project structure

```text
packages/backend/convex/mcp/tools/discovery.ts   Tool registration, schemas, result shaping
packages/backend/convex/mcpDiscovery.ts          Internal queries taking ownerId from the principal
packages/backend/convex/mcpDiscovery.test.ts     convex-test: ownership, pagination, limits
packages/backend/convex/items.ts, itemLabels.ts, labels.ts
                                                 Existing; bodies extracted to ownerId helpers
docs/mcp.md                                      Tool reference and agent usage guidance
docs/verification/mcp-discovery.md               Real-client evidence
```

## Code style

Existing conventions: ESM TypeScript, double quotes, semicolons, explicit Convex
validators, colocated tests, `ConvexError({ code, message })` for domain errors.
Tool descriptions are part of the contract and are tested.

```ts
export const browseItems = internalQuery({
  args: {
    ownerId: v.string(), // internal only; set by the verified MCP handler
    labelId: v.optional(v.id("labels")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(itemPreview),
  handler: (ctx, args) => listItemsPage(ctx, args.ownerId, args),
});
```

The public `items.list` becomes `requireOwner(ctx)` + the same `listItemsPage`,
so web behavior and its tests are unchanged.

## Testing strategy

- **convex-test, two owners:** every tool returns only the caller's data; a
  foreign `itemId`/`labelId`/cursor behaves exactly like a missing one; an
  `ownerId` argument is unreachable from any public function.
- **Parity:** for the same fixture, the MCP helpers return the same item ids and
  order as the existing public queries (guards the refactor).
- **Pagination:** a label of 25+ items is fully enumerated in order with no
  duplicates or omissions across pages; `isDone` is true only on the last page;
  an empty non-final page is handled; mismatched-filter cursor is rejected.
- **Completeness honesty:** search always reports `exhaustive: false`; excluded
  items never appear; `suggested` marking and `needsReview` filter are correct.
- **Missing enrichment:** pending/failed/not_started items are listed and report
  `linkedPageRead: false`.
- **Content limits:** a >20,000-char item is read in multiple calls whose
  concatenation equals the stored text; the 64 KiB cap and link/label caps flag
  rather than drop silently.
- **Label resolution:** case-insensitive exact match; near miss, both-args, and
  foreign id errors.
- **Protocol:** through the real handler — tool listing shows schemas,
  annotations and descriptions; a token lacking `mindspool:read` gets `403`
  before any query; read-only token calls all four tools successfully.
- **Real clients (Codex, Claude Code):** connect, list labels, enumerate a label
  spanning multiple pages, search, read an item with continuation, confirm the
  agent states coverage correctly. Record versions and results in
  `docs/verification/mcp-discovery.md`; list unverified cases honestly.

No percentage coverage target; each contract sentence above needs an assertion.

## Boundaries

- **Always:** derive `ownerId` only from the verified principal; check ownership
  of every label, item and cursor; bound every read and response; flag every
  truncation; keep existing web query behavior and tests green.
- **Ask first:** any other schema or index change (the `by_owner_from` index
  on `fromItemId` is approved); raising the 10-item page cap; adding
  dependencies; fuzzy label matching; returning image bytes.
- **Never:** expose an `ownerId` argument on a public function; add write tools
  here; fetch linked URLs; call a model; present search results as exhaustive;
  log clip text, titles, URLs or queries; weaken or delete existing tests.

## Success criteria

1. A read-only Codex and a read-only Claude Code session each enumerate a label
   of more than 10 clips across pages, ending on `isDone: true`, and the
   enumerated ids equal the label's membership in the web app.
2. Search returns ranked results scoped to the library or one label and always
   reports `exhaustive: false`.
3. `get_item` returns saved content, labels, and links for an item, and
   reassembles a long item exactly via continuation.
4. Items with failed or pending enrichment appear in browsing and are not
   described as having had their page read.
5. No tool returns another account's data in any test, including via forged ids
   and cursors; a token without `mindspool:read` executes nothing.
6. Every truncation is visible in the result; no tool response exceeds 64 KiB.
7. Existing web/backend suites pass unchanged; `pnpm check` is green.

## Open questions

1. ~~Reddit captures~~ **Decided:** `get_item` includes the post text and then
   the comments in the same paged `content` stream. Summaries (browse and
   search) show only a ~120-character `snippet` of the saved content.
2. ~~Reverse link navigation~~ **Decided (option B):** `get_item` returns
   `linkedItems` via a new `fromItemId` index, resources first. It requires the
   tweet-links work (`fromItemId`) to be on main before this module is built; the
   plan must sequence that dependency, and the index (with a backfill for link
   clips whose `fromItemId` is recovered from their capture key) is part of this
   module's plan.
3. ~~Label item counts~~ **Decided:** no counts; `hasItems` per label instead
   (see `mindspool_list_labels`).
4. ~~Images~~ **Decided:** URLs only, no image data.
5. ~~Search scope~~ **Decided:** whole-library search includes inbox and
   unlabeled clips, as in the web app.

## Review gate

Approve or revise the four tools, the browse-vs-search split, the limits, and
the recommendations above. Stop here: no plan, tasks, or code until approved.
