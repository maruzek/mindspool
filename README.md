# Project MindSpool

## Core Concept

A multi-platform, unified knowledge base and visual workspace. Instead of isolating bookmarks across X, Instagram, TikTok, and standard browsers, MindSpool aggregates information (videos, images, recipes, code packages, inspiration) into a single centralized system. It features automated AI labeling and spatial organization, acting as a personal "second brain."

Labels serve as collections. Each saved item can have multiple labels, and each label can contain multiple items. Opening a label shows all items assigned to it; opening an item shows its labels. The core model uses Items, Labels, item-label assignments, and Processing Runs, without a separate Collection entity.

MindSpool is also a personal playground for experimenting with typed AI decisions using **Jev**, Cloudflare's **Clef / Clef-flash**, and a future **OpenAI Decisions API** integration. The main experiment is letting decision models handle sorting and labeling across real saved content, including images, while keeping results inspectable and easy to correct.

## Tech Stack & Infrastructure

- **Repository:** Monorepo (Turborepo + pnpm workspaces) dividing `packages/ui`, `packages/schema`, and individual apps.
- **Database & Backend:** Convex (Cloud). Handles real-time WebSockets, database schema, and serverless background Actions.
- **Web App:** React + Vite.
- **Mobile App:** React Native (Expo) - functioning primarily as a native Android share target.
- **Authentication:** Clerk, using the React, Expo, and Chrome extension SDKs. Convex verifies Clerk JWTs; every library function enforces ownership server-side.
- **Sorting & Labeling:** Experiment with [Jev (TypeSafe AI)](https://docs.typesafe.ai/introduction), [Clef](https://developers.cloudflare.com/workers-ai/models/clef/), and [Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/). They support System One typed questions: Choice for category selection, Noul for independent label membership, and Score for ranking against explicit rubrics. Keep provider-specific calls and input capabilities behind a small shared interface.
- **Visual Decisions (Workers AI):** Clef and Clef-flash accept image inputs alongside the state, enabling classification of saved images, screenshots, and thumbnails. Call Workers AI through its REST API from Convex Actions, or use a Worker with an AI binding if useful. The current image API accepts up to four embedded PNG/JPEG/WebP images per request, with documented size limits; remote image URLs must be fetched and converted before submission.
- **Future Decision Provider:** OpenAI Decisions API, as an intended integration with no public release date known to the project. Its capabilities and request/response contract remain unverified; implement the adapter when documentation and access become available.
- **Fallback Worker (Optional):** Raspberry Pi connected via Cloudflare Tunnel to run headless browsers (Puppeteer) or `yt-dlp` for heavy scraping tasks that block standard cloud IPs.

## UI & Views

- **Label List View:** A clean, structured interface displaying all saved items, sortable and filterable by their assigned labels. Each label opens a view of its items; each item exposes its assigned labels. This acts as the reliable fallback for quickly finding specific content.
- **Spatial Board (Miro-style):** Powered by **React Flow (XYFlow)** using static X/Y coordinates saved to the database, allowing freeform placement of nodes.
- **Network Graph (Obsidian-style):** Powered by **React Flow** combined with **d3-force**. Passing your nodes through `d3-force` applies physical gravity and repulsion based on shared labels, automatically generating a fluid, clustered, physics-based network diagram.

## Ingestion & Bypassing Paywalls (e.g., X API)

- **Browser Extension:** Bypasses APIs entirely by using content scripts to scrape the locally rendered DOM (HTML, text, image URLs) directly from the active tab.
- **Mobile Sharing (X links):** Uses open-source proxy APIs like **FxTwitter** or **VxTwitter** to fetch clean structured JSON metadata for shared X posts without needing an API key.
- **Video Archiving:** Uses `yt-dlp` running on a worker to directly extract MP4 files from TikTok, Instagram, and X for permanent storage.

## Development Roadmap

Prioritize a useful personal workspace and early decision-model experiments. Each phase should produce something usable or a concrete comparison; work can continue without waiting for the OpenAI Decisions API.

1.  **Foundation & Sample Content:** Set up the monorepo and Convex schema for Items, Labels, item-label assignments, and Processing Runs. Include ownership, original/canonical URLs, source metadata, extracted content, image asset references, and capture/enrichment status. Seed a small, varied set of real saves, including images and screenshots. Define a starting label vocabulary and sorting rubrics so experiments have consistent inputs.
2.  **Usable Inbox & Retrieval (Web App):** Build manual URL/text saving, deduplication, a list view, text search, and label filters. Connect Clerk authentication with Convex ownership checks, deletion, and export. Save the original input immediately; metadata extraction and decisions run asynchronously, with visible pending or failed states.
3.  **Jev & Clef Sorting and Labeling Playground:** Use Convex Actions to evaluate sample content through Jev and Workers AI adapters for Clef/Clef-flash. Start with typed questions for content category, independent label membership, and ranking scores; apply sorting rules in code using those results. Include an early Clef image-classification experiment using the seeded images. Record provider/model, input modality, question/rubric version, outputs, confidence where available, latency, and cost when available. Add reprocessing and manual corrections, preserving user changes separately from model suggestions.
4.  **Real Capture & Visual Classification:** Build a minimal Android share receiver early for social-app URLs and shared images/screenshots, plus a browser-extension capture flow for page metadata, selected text, and images. Test representative saves from X, Instagram, TikTok, and ordinary websites, retaining bookmarks when extraction fails. Fetch/store selected image assets, resize or convert them to meet Clef's image limits, and submit embedded image data with the state for visual labeling. Keep Convex as the system of record.
5.  **Decision Comparison & Daily Use:** Create a small evaluation set with expected labels and relative rankings. Compare Jev, Clef, and Clef-flash on identical text inputs; separately compare Clef's text-only and text-plus-image results to measure the value of visual context. Inspect accuracy, confidence where available, latency, failures, and cost, and use manual corrections to improve the evaluation set. Add retry/backoff and idempotent processing so failed or repeated jobs do not duplicate items or overwrite corrections.
6.  **Spatial Boards & Network Exploration:** Build React Flow boards with board-specific item placements, allowing one item on multiple boards. Add a d3-force graph based on labels and selected relationships, with explicit connections kept distinct from inferred similarities. Limit dense connections and let layouts settle rather than continuously persisting simulation ticks. Explore whether model-assigned labels and scores make these views more useful.
7.  **Selective Archiving & Extraction Workers (Optional):** Add yt-dlp/headless-browser extraction for selected sources when metadata capture is insufficient. Keep the Raspberry Pi as an optional worker behind a replaceable job interface, and experiment with R2 storage if useful. Track whether an item has only a saved link, captured text/images, or an archived media file; include storage limits, deletion, and backup/export behavior.
8.  **OpenAI Decisions API Experiment (When Available):** Once access and documentation exist, implement a provider adapter based on its actual supported capabilities. Compare overlapping sorting and labeling tasks against Jev and Clef/Clef-flash using the same evaluation set. Decide whether it replaces, complements, or remains an alternative to the existing providers based on observed results; earlier phases remain independent of its release.

## Local Development

Use **Node.js 24.12+** and **pnpm 12.8.1**. The repository pins pnpm through `packageManager`; use pnpm for every install, generator, and CLI invocation.

```text
apps/
  web/                 React + Vite web workspace
  mobile/              Expo native app
  extension/           WXT browser extension
packages/
  backend/             Convex schema and Clerk JWT verification
  schema/              Shared platform-independent TypeScript types
  ui/                  Shared DOM UI for web and extension
  typescript-config/   Shared strict TypeScript presets
```

Install and start the web shell:

```sh
pnpm install
pnpm dev
```

The web app runs at `http://localhost:5173`. App shells build without credentials and display a sign-in setup message until Clerk is configured. The backend contains owned Items, Labels, item-label assignments, and Processing Runs. The web app is being rebuilt to the Modernist design. Today it provides the sidebar and icon-rail frame, routing, the authenticated gate, label creation and navigation, and the library: a capture bar for links and notes, a paginated list or grid of items on `/library` and `/labels/<id>` (`?layout=list|grid`, `?item=<id>` for selection), and placeholders for Inbox, Boards, and Graph. Selecting an item opens the inspector: source, preview, saved line, confirmed labels (remove, add from your labels), the latest processing run, and delete. Clef labeling is in: saving an item labels it automatically with Clef-flash (needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AUTH_TOKEN` in Convex env), and the inspector can re-run it with Clef-flash or Clef; labels can carry a description sent to the model as context, and see the [Clef labeling verification](docs/verification/clef-labeling.md). To stay inside the Workers AI free tier, at most 500 characters of an item are sent to the model, and each owner has a daily budget of 9,000 neurons (resets 00:00 UTC; override with `AI_DAILY_NEURON_LIMIT` in Convex env). At the limit, saving still works but the item is left unlabeled with a failed run "Daily AI limit reached", and Classify says so. A bar above the sidebar footer shows today's usage ([ai-limit verification](docs/verification/ai-limit.md)). Search, boards, and graph follow (see [the capability map](CAPABILITY-MAP-web-redesign.md)). See [core concepts](docs/core-concepts.md) and the verification reports for the [library foundation](docs/verification/library-foundation.md) the [web shell](docs/verification/web-shell.md), the [library view](docs/verification/library-view.md), and the [item inspector](docs/verification/item-inspector.md).

| Command                                            | Purpose                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev:web`                                     | Start Vite                                                                 |
| `pnpm dev:mobile`                                  | Start Metro for an Expo development build                                  |
| `pnpm --filter @mindspool/mobile android`          | Build and launch Android locally (requires Android SDK/device or emulator) |
| `pnpm dev:extension`                               | Start WXT for Chrome development                                           |
| `pnpm dev:backend`                                 | Start Convex development after initialization                              |
| `pnpm typecheck`                                   | Typecheck all source workspaces                                            |
| `pnpm build`                                       | Bundle web, extension, and Android JavaScript (not a native APK)           |
| `pnpm --filter @mindspool/extension build:firefox` | Check Firefox bundle compatibility                                         |
| `pnpm format`                                      | Format application/configuration/docs files                                |
| `pnpm check`                                       | Run formatting, backend/web tests, typechecking, and builds                |

### Clerk and Convex

Use one Clerk development instance for all apps. Copy each app's `.env.example` to `.env.local` and fill in its publishable key; keys and deployment configuration stay out of version control. Never put a Clerk secret key in a `VITE_`, `WXT_PUBLIC_`, or `EXPO_PUBLIC_` variable.

- **Web:** Set `VITE_CLERK_PUBLISHABLE_KEY` in `apps/web/.env.local`. Sign-in, account creation, and profile controls use Clerk's prebuilt UI.
- **Mobile:** Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env.local`. Enable the Native API in the Clerk dashboard and configure the intended sign-in methods. Clerk's native UI uses the SDK's secure token cache and requires a development build; it cannot run in Expo Go. Native components are experimental/beta, so verify a real sign-in and session persistence on a device before relying on them.
- **Chrome extension:** Set `WXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `WXT_PUBLIC_CLERK_FRONTEND_API` (the HTTPS Frontend API origin), and `CLERK_EXTENSION_PUBLIC_KEY` in `apps/extension/.env.local`. Use a stable public extension key and register its `chrome-extension://<id>` origin with Clerk. The popup uses Clerk's extension SDK; OAuth/SAML synchronization with the web app is a later integration. Firefox compilation does not verify that the Chrome-specific Clerk SDK authenticates on Firefox.

Initialize the backend from its workspace:

```sh
pnpm --filter @mindspool/backend setup
```

This interactive command lets you choose your Convex development project and writes `packages/backend/.env.local`. Activate Clerk's Convex integration (or create its `convex` JWT template), then configure your Clerk Frontend API issuer on that Convex development deployment:

```sh
pnpm --filter @mindspool/backend exec convex env set CLERK_JWT_ISSUER_DOMAIN https://your-instance.clerk.accounts.dev
pnpm dev:backend
```

Set `VITE_CONVEX_URL` in `apps/web/.env.local` to the selected deployment URL. The web app's `ConvexProviderWithClerk` passes Clerk identity to Convex. A deployment with no issuer configured has no accepted JWT providers; set the issuer before testing authenticated calls. `EXPO_PUBLIC_CONVEX_URL` is reserved for the mobile data client in the next roadmap phase.

The web foundation is connected to the existing **MindSpool** Clerk development
application and Convex personal development deployment **graceful-stork-346** in
`martin-ruzek/mindspool` (`eu-west-1`). Native and extension authentication still
require their platform configuration and runtime checks.

To restore web keys for this existing Clerk application, authenticate with the
CLI on your host and run the following from `apps/web`:

```sh
pnpm dlx clerk@latest auth login
pnpm dlx clerk@latest env pull --app app_3KDcmIpsctFQskbj1jENpIL2BPi --instance dev
```

The web uses only the publishable key; the CLI also writes an ignored secret key.
Set `VITE_CONVEX_URL=https://graceful-stork-346.eu-west-1.convex.cloud` in
`apps/web/.env.local`. To select the existing backend without creating a new
project:

```sh
pnpm --filter @mindspool/backend exec convex deployment select martin-ruzek:mindspool:dev
pnpm dev:backend
```

### Generated definitions and local checks

Official Convex definitions are tracked under `packages/backend/convex/_generated`.
The web imports them through `@mindspool/backend/api` and
`@mindspool/backend/data-model`. A clean checkout needs no runtime credentials to
run `pnpm check`. After changing backend contracts, regenerate against your
selected development deployment with `pnpm --filter @mindspool/backend codegen`.

### Development examples

Examples are disabled by default. Enable them explicitly on your selected
**development** deployment, after checking the target:

```sh
pnpm --filter @mindspool/backend exec convex env set MINDSPOOL_ENVIRONMENT development
pnpm --filter @mindspool/backend exec convex env set MINDSPOOL_ENABLE_DEV_SEED true
```

Sign in, then click **Load examples**. Loading again preserves existing saves and
manual label removals. Examples include URL/text saves, two shared labels, and an
illustrative screenshot reference; the image binary is not downloaded. Versioned
starting label guidelines live in
[the sample definitions](packages/backend/convex/sampleContent.ts). These are
fixtures for later experiments, and no provider is called. Both flags are enabled
on the current development deployment. Remove either flag to disable the loader.

Search, deletion/export, enrichment jobs, AI adapters, native/extension capture,
and spatial views remain future roadmap work.
