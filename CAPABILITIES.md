# Capability Map: Repository Setup

Status: implemented for the approved library foundation; verification recorded in
[the implementation report](docs/verification/library-foundation.md).

## Implemented Modules

| Module id        | Responsibility                                                                                                                                       | Depends on     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `identity`       | Existing Clerk development application linked to Convex, verified client gating, server-derived ownership, anonymous/cross-owner tests.              | —              |
| `core-library`   | Owned Items, Labels as collections, manual include/exclude membership, paginated navigation, internal processing history and concurrency protection. | `identity`     |
| `sample-content` | Authenticated opt-in development examples, shared labels, screenshot references, and versioned starting label guidelines.                            | `core-library` |

The web previously implemented URL/text capture, owned inbox/detail views, label
assignment, and both navigation directions. During the Modernist redesign
([capability map](CAPABILITY-MAP-web-redesign.md)) that UI was removed; the new
`web-shell` provides the frame, routing, auth gate, and label navigation, and
`library-view` and `item-inspector` restore capture and item views, and
`search-and-filters` adds full-text search, source and needs-review filters and the Inbox
(see [core concepts](docs/core-concepts.md)). `ai-limit` is a guardrail around the one place the app spends
Workers AI: item content sent to the model is capped at 500 characters and each owner has a daily neuron budget
(`aiUsage`, default 9,000, resets 00:00 UTC) shown as a bar in the sidebar ([report](docs/verification/ai-limit.md)). The backend contracts above are unchanged,
plus a read-only `labels.get`, `items.detail`/`remove`, and the search and counter queries. Generated Convex imports are tracked;
`pnpm check` includes the local backend and web regression suites.

## Accepted Contracts

- Each Clerk user owns a private workspace. Collaboration, organizations, and
  public sharing can be specified separately when needed.
- Authentication remains Clerk; Convex verifies identity and enforces access to
  every user-owned document. Clients cannot supply an owner to impersonate.
- An Item is the saved content record. Each Item can have multiple Labels, and
  each Label can contain multiple Items. Labels serve as collections: opening a
  Label lists its Items, and opening an Item shows its Labels. There is no separate
  Collection entity. Processing Runs record enrichment or decision attempts and
  their results.
- Capture preserves original input immediately. Enrichment can remain pending or
  fail without losing the save. Original and canonical URLs have distinct roles.
- Image asset references and source/extracted metadata belong in the foundation.
  Implementing image fetching, scraping, and model calls comes in later phases.
- Manual classifications remain distinct from automated suggestions so future
  reprocessing cannot silently overwrite a user's corrections.
- Tests run locally with mocked identities. Live sign-in requires a configured
  Clerk instance and Convex development deployment; native sign-in additionally
  requires a development build and device or emulator.
- Sample content is explicitly requested per signed-in user, repeatable, and
  never inserted automatically into production.

## Later Roadmap Work

Deletion/export, asynchronous extraction and image storage, provider
adapters, Android share receiver, extension capture, spatial boards, and network
graphs remain subsequent phases. The source of scope and acceptance criteria is
[the approved plan](tasks/archive/library-foundation-plan.md); a separate specification is appropriate when
starting the next provider or capture module.
