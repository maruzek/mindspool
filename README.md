# Project MindSpool

## Core Concept

A multi-platform, unified knowledge base and visual workspace. Instead of isolating bookmarks across X, Instagram, TikTok, and standard browsers, MindSpool aggregates information (videos, images, recipes, code packages, inspiration) into a single centralized system. It features automated AI labeling and spatial organization, acting as a personal "second brain."

MindSpool is also a personal playground for experimenting with typed AI decisions using **Jev**, Cloudflare's **Clef / Clef-flash**, and a future **OpenAI Decisions API** integration. The main experiment is letting decision models handle sorting, labeling, and collection assignment across real saved content, including images, while keeping results inspectable and easy to correct.

## Tech Stack & Infrastructure

- **Repository:** Monorepo (Turborepo + pnpm workspaces) dividing `packages/ui`, `packages/schema`, and individual apps.
- **Database & Backend:** Convex (Cloud). Handles real-time WebSockets, database schema, and serverless background Actions.
- **Web App:** React + Vite.
- **Mobile App:** React Native (Expo) - functioning primarily as a native Android share target.
- **Authentication:** Clerk, using the React, Expo, and Chrome extension SDKs. Convex verifies Clerk JWTs; each future data function must enforce ownership server-side.
- **Sorting & Labeling:** Experiment with [Jev (TypeSafe AI)](https://docs.typesafe.ai/introduction), [Clef](https://developers.cloudflare.com/workers-ai/models/clef/), and [Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/). They support System One typed questions: Choice for category/collection selection, Noul for independent label membership, and Score for ranking against explicit rubrics. Keep provider-specific calls and input capabilities behind a small shared interface.
- **Visual Decisions (Workers AI):** Clef and Clef-flash accept image inputs alongside the state, enabling classification of saved images, screenshots, and thumbnails. Call Workers AI through its REST API from Convex Actions, or use a Worker with an AI binding if useful. The current image API accepts up to four embedded PNG/JPEG/WebP images per request, with documented size limits; remote image URLs must be fetched and converted before submission.
- **Future Decision Provider:** OpenAI Decisions API, as an intended integration with no public release date known to the project. Its capabilities and request/response contract remain unverified; implement the adapter when documentation and access become available.
- **Fallback Worker (Optional):** Raspberry Pi connected via Cloudflare Tunnel to run headless browsers (Puppeteer) or `yt-dlp` for heavy scraping tasks that block standard cloud IPs.

## UI & Views

- **Label List View:** A clean, structured interface displaying all saved items, sortable and filterable by their assigned tags. This acts as the reliable fallback for quickly finding specific content.
- **Spatial Board (Miro-style):** Powered by **React Flow (XYFlow)** using static X/Y coordinates saved to the database, allowing freeform placement of nodes.
- **Network Graph (Obsidian-style):** Powered by **React Flow** combined with **d3-force**. Passing your nodes through `d3-force` applies physical gravity and repulsion based on shared labels, automatically generating a fluid, clustered, physics-based network diagram.

## Ingestion & Bypassing Paywalls (e.g., X API)

- **Browser Extension:** Bypasses APIs entirely by using content scripts to scrape the locally rendered DOM (HTML, text, image URLs) directly from the active tab.
- **Mobile Sharing (X links):** Uses open-source proxy APIs like **FxTwitter** or **VxTwitter** to fetch clean structured JSON metadata for shared X posts without needing an API key.
- **Video Archiving:** Uses `yt-dlp` running on a worker to directly extract MP4 files from TikTok, Instagram, and X for permanent storage.

## Development Roadmap

Prioritize a useful personal workspace and early decision-model experiments. Each phase should produce something usable or a concrete comparison; work can continue without waiting for the OpenAI Decisions API.

1.  **Foundation & Sample Content:** Set up the monorepo and Convex schema for Items, Labels, Collections, and Processing Runs. Include ownership, original/canonical URLs, source metadata, extracted content, image asset references, and capture/enrichment status. Seed a small, varied set of real saves, including images and screenshots. Define a starting label vocabulary and sorting rubrics so experiments have consistent inputs.
2.  **Usable Inbox & Retrieval (Web App):** Build manual URL/text saving, deduplication, a list view, text search, and label/collection filters. Connect Clerk authentication with Convex ownership checks, deletion, and export. Save the original input immediately; metadata extraction and decisions run asynchronously, with visible pending or failed states.
3.  **Jev & Clef Sorting and Labeling Playground:** Use Convex Actions to evaluate sample content through Jev and Workers AI adapters for Clef/Clef-flash. Start with typed questions for content category, label membership, collection assignment, and ranking scores; apply sorting rules in code using those results. Include an early Clef image-classification experiment using the seeded images. Record provider/model, input modality, question/rubric version, outputs, confidence where available, latency, and cost when available. Add reprocessing and manual corrections, preserving user changes separately from model suggestions.
4.  **Real Capture & Visual Classification:** Build a minimal Android share receiver early for social-app URLs and shared images/screenshots, plus a browser-extension capture flow for page metadata, selected text, and images. Test representative saves from X, Instagram, TikTok, and ordinary websites, retaining bookmarks when extraction fails. Fetch/store selected image assets, resize or convert them to meet Clef's image limits, and submit embedded image data with the state for visual labeling and collection assignment. Keep Convex as the system of record.
5.  **Decision Comparison & Daily Use:** Create a small evaluation set with expected labels, collections, and relative rankings. Compare Jev, Clef, and Clef-flash on identical text inputs; separately compare Clef's text-only and text-plus-image results to measure the value of visual context. Inspect accuracy, confidence where available, latency, failures, and cost, and use manual corrections to improve the evaluation set. Add retry/backoff and idempotent processing so failed or repeated jobs do not duplicate items or overwrite corrections.
6.  **Spatial Boards & Network Exploration:** Build React Flow boards with board-specific item placements, allowing one item on multiple boards. Add a d3-force graph based on labels and selected relationships, with explicit connections kept distinct from inferred similarities. Limit dense connections and let layouts settle rather than continuously persisting simulation ticks. Explore whether model-assigned collections and scores make these views more useful.
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

The web app runs at `http://localhost:5173`. App shells build without credentials and display a sign-in setup message until Clerk is configured. The initial backend schema has no application tables or functions.

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
| `pnpm check`                                       | Run formatting, typechecking, and builds                                   |

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

The monorepo foundation includes SDK wiring and compilation checks. End-to-end authentication still needs your Clerk instance, Convex development deployment, registered extension origin, and a mobile development build.
