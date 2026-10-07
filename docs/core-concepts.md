# Library core concepts

MindSpool stores a private library for each verified Clerk identity. Convex derives
`ownerId` from the token's `tokenIdentifier` (issuer plus subject); public functions
never accept an owner argument. Anonymous calls fail. Foreign and missing ids
both return “Not found.” Authentication is checked before library hooks mount.

## Items and Labels

An **Item** is a saved URL or text. Capture stores the original input verbatim,
including whitespace and query parameters. A canonical URL and extracted content
are separate optional enrichment fields. Capture succeeds independently of
metadata extraction. URL inputs allow HTTP/HTTPS without embedded credentials.
Limits are 8,192 characters for URLs and 100,000 for text.

A **Label is a collection**. One Item can belong to multiple Labels, and one Label
can contain many Items. Open a Label to see its Items; open an Item to see and
change its Labels. There is no separate Collection table. Label names are trimmed,
limited to 80 characters, and deduplicated case-insensitively within one owner.

The `itemLabels` table records one manual decision per owner/Item/Label pair.
`include` means assigned; `exclude` remembers an explicit removal. Removal never
deletes the Item or Label. Repeated attach/remove calls are idempotent. Every
relationship operation checks ownership of both endpoints.

A capture key identifies one submission attempt. Retrying that key with the same
payload returns the saved Item; different input with that key fails. Independent
saves use new keys and remain distinct. This does not deduplicate equal URLs
saved intentionally on separate occasions.

Unsaved drafts belong to the signed-in Clerk session, outside the Convex query
boundary (a `CaptureDraftProvider` mounted above the Convex auth gate). Authentication refresh can hide the library without discarding the
input or capture key. Drafts use best-effort browser session storage to survive a
Reconnect/page reload, and are removed on sign-out or account/session changes.
Stale drafts are purged once Clerk resolves the current session. A late result
from an older save cannot clear a newer draft. If session storage is unavailable,
in-memory retention works but restoration across page reload is unavailable.

## Web shell

The web app is a Vite single-page app using TanStack Router file routes
(`apps/web/src/routes`, generated tree committed). The root route runs the auth gate
(Clerk loaded and signed in, then Convex-verified) before any data hook mounts; it
shows distinct states for loading, signed out, connecting, auth failure, load
error, and missing configuration. Two layouts sit inside the gate: `_app`, the
240px dark sidebar with Inbox, Library, labels, and the account menu, and `_rail`,
a 60px icon rail for the full-bleed Boards and Graph canvases. Below 768px the
sidebar becomes a sheet. Label pages live at `/labels/$labelId`; `labels.get`
returns null for foreign, missing, and malformed ids, so the page shows the same
"Not found" for all three. Boards, Graph, Inbox, and Library content are
placeholders until their modules land. The sidebar and rail share a scoped dark
palette (`.dark-sidebar`) without a global dark mode.

## Processing and image references

A **Processing Run** records one enrichment or decision attempt. It retains its
question/rubric version, optional provider/model, input modality, result or error,
and measurements only when supplied. Worker writes are internal Convex mutations;
public callers can only read their own Item's history. Finalized Runs cannot be
rewritten. No scraping or model execution is implemented yet.

Enrichment transitions through `not_started`, `pending`, `succeeded`, and `failed`.
Failures retain the original save. The Item points to its latest enrichment Run,
so completion of an older attempt cannot overwrite newer content or state.

Model suggestions remain on the Run. They do not update manual assignments.
Both manual additions and explicit removals survive later suggestions.

Image assets distinguish external URL references from future owned storage
references. This phase accepts safe external references through internal workers.
New storage references require an ownership-checked upload flow and are rejected
until that flow exists. Development examples use illustrative `example.org`
references; no image binary is fetched or uploaded.

## Bounded browsing and examples

Lists use owner-prefixed indexes and cursor pagination. List results (`items.list`
and `itemLabels.listItemsForLabel`) are previews: 160-character input, bounded
titles, `enrichmentStatus`, `captureSource`, `originalUrl`, up to three included
Labels (`{ _id, name }`) and a `labelCount` capped at four, so a row can show
`+N`. Pages are clamped to ten Items; each Item reads at most four `itemLabels`
rows and three Label documents. Excluded and foreign Labels never appear.
`items.get` returns the full document. `items.detail` takes a string id and
returns `null` for foreign, missing, malformed, and deleted ids; otherwise the
full original input, URLs, capture source, enrichment status, and source
metadata (never `ownerId`, `captureKey`, or run pointers). The item-scoped joins
`itemLabels.listForItem` and `itemLabels.availableLabels` clamp pages to ten.

`items.remove` deletes an Item in one transaction together with its `itemLabels`
rows, its Processing Runs, and any stored image assets. It refuses with
`CONFLICT` and deletes nothing when the Item has more than 500 label links or
100 runs, so no orphaned link can break a label's item list.
Inbox pagination limits database bytes read. Queries that join large Items or Run
suggestions enforce a maximum of ten source rows, including reactive page ranges;
Convex split metadata is preserved for the paginated React client.

The development seeder requires both `MINDSPOOL_ENVIRONMENT=development` and
`MINDSPOOL_ENABLE_DEV_SEED=true` on the backend. It is authenticated and opt-in
per user. Repeating it skips existing Items and preserves manual membership edits.
Versioned label guidelines in `convex/sampleContent.ts` are starting fixtures for
future experiments, rather than evidence of model quality.

## Next increment

Build one asynchronous enrichment path that retains captured content on failure,
then a decision-provider adapter using the versioned sample questions. Search,
export/deletion, real image uploads, capture from mobile/extension, and spatial
views remain separate roadmap work.

## Implementation references

- [Convex authenticated functions](https://docs.convex.dev/auth/functions-auth)
- [Clerk integration and verified client gating](https://docs.convex.dev/auth/clerk)
- [Pagination](https://docs.convex.dev/database/pagination)
- [Platform limits](https://docs.convex.dev/production/state/limits)
- [Convex test harness](https://docs.convex.dev/testing/convex-test)
