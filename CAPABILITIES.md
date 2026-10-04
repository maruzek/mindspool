# Capability Map: Repository Setup

Status: proposed for review.

Continue the README's foundation phase by establishing authenticated ownership,
the core knowledge model, and repeatable sample content.

## Current State

- The pnpm/Turborepo monorepo and web, mobile, and extension shells exist.
- Clerk providers and sign-in controls exist in all three apps. The web app can
  pass Clerk identity to Convex when configured.
- Convex has JWT provider configuration, but its schema has no application tables
  and there are no application functions.
- The shared schema package contains only capture-source and decision-provider
  identifiers. There is no test runner or application test suite yet.
- App and backend `.env.local` files are absent. Live authentication has not been
  verified; the previous foundation plan records compilation and shell checks.

## Proposed Modules

| Module id        | Responsibility                                                                                                                                                                                                            | Depends on     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `identity`       | Clerk-to-Convex identity contract, reusable server-side authentication and ownership checks, configuration guidance, and tests proving anonymous and cross-user access is rejected.                                       | —              |
| `core-library`   | Shared core concepts, Convex schema, and minimal authenticated data functions for Items, Labels, item-label assignments, and Processing Runs; capture/enrichment states and manual edits separate from model suggestions. | `identity`     |
| `sample-content` | Repeatable, user-owned development examples, including image/screenshot references, a starting label vocabulary, and versioned sorting rubrics for later decision experiments.                                            | `core-library` |

Build order: `identity` → `core-library` → `sample-content`.

## Assumptions for Review

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

The full inbox UI, retrieval/search, decision-provider adapters, Android share
receiver, extension capture, spatial boards, network graphs, and archiving workers
remain subsequent roadmap phases. This setup establishes the contracts they use.

## Next Review Artifact

After reviewing module boundaries, dependencies, and assumptions, write
`SPEC-identity.md` first. Each later module gets its own specification under its
stable module id, covering its contracts, acceptance criteria, and verification.
