# Implementation Plan: Tweet link extraction

Spec: [SPEC-tweet-links.md](../../SPEC-tweet-links.md). Tasks: [todo.md](tweet-links-todo.md). The previous plan (item media) is archived at `tasks/archive/item-media-*.md`.

## Overview

When a tweet clip mentions two or more links, each link is saved as its own Item and enriched like any pasted link, which gives it an `og:image` thumbnail. Every link Item carries a normalised `urlKey`, so the same resource is never saved twice.

## Architecture Decisions

- **Detection runs on the server, from `extractedText`.** One code path serves extension clips, mobile clips and the backfill. Mobile text is already expanded. The extension is changed to write full URLs instead of display text.
- **`extractLinks`/`urlKey` live in `packages/schema`.** They are pure functions that need no Convex and are importable from the backend like `reddit.ts`.
- **Dedupe uses a field and an index, not the capture key.** Capture keys identify submissions, and plain pastes use random keys. `urlKey` + `by_owner_url_key` lets every link save look up "do I already have this link?". The lookup uses `.first()`, because duplicates saved before this feature can exist.
- **Extraction is a scheduled internal mutation** (`tweetLinks.extract`). It runs after the tweet is inserted, so an error can never fail the clip. Convex OCC serialises concurrent extractions over the same `urlKey` range.
- **Resource Items are inserted through `insertCapture`.** That keeps counters, `sourceKind`, search state, enrichment (which yields the thumbnail) and labeling-after-enrichment working without new code.
- **Plain link saves dedupe too.** Clips with content keep capture-key identity (spec §7).

## Dependency graph

```
T1 links.ts (extractLinks, urlKey) ─┬─► T3 urlKey field + plain-link dedupe ─► T4 tweetLinks.extract on capture ─► T5 backfill
T2 extension full URLs ─────────────┘                                                                              │
                                                                                         T6 docs + full gate ◄──────┘
```

T1 and T2 are independent. T3–T5 are sequential.

## Risks

| Risk                                                                                 | Mitigation                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| False-positive links (abbreviations, file names)                                     | Only links with a scheme are taken. The extension guarantees the scheme for real tweet links.        |
| Real X DOM differs from fixtures (hidden `https://`, `…`)                            | Use the anchor's whole `textContent`, strip `…`, add a scheme if missing. Fall back to display text. |
| A tweet with many links fans out into many enrichments and labeling runs (AI budget) | Cap of 20 links per tweet. The existing daily neuron budget still applies.                           |
| `urlKey` over-normalises (path case, meaningful params)                              | Path case is kept, and only a fixed list of tracking params is removed.                              |
| Old items have no `urlKey`                                                           | The backfill sets keys before it extracts.                                                           |

## Checkpoints

- After T1–T2: schema and extension tests pass.
- After T4: backend tests pass. The three example tweets produce 7, 2 and 5 Items with pending enrichment.
- After T6: `pnpm check` passes.
