# Tasks: Authenticated Library Foundation

Status: approved by the user; implementation in progress.

## Execution Notes

- Working branch: `feature/library-foundation`.
- Clerk CLI 3.4.0 was checked on the host: no login, no linked application, and no
  local environment files. An existing Clerk application must be selected before
  live configuration; do not initialize a replacement application.
- Convex has account credentials on this machine, but this repository has no
  selected deployment. Resolve the development target before deployment commands.
- Prepare independently testable local work while configuration is pending; live
  checks and dependent tasks remain unchecked until they actually pass.
- Convex project discovery found `MindSpool` (`mindspool`) under `martin-ruzek`.
  Clerk login/application selection was requested asynchronously.
- Local backend definitions were bootstrapped using the inspected Convex 1.46.0
  CLI local-codegen branch. No deployment was selected or changed. Cloud
  generation and live authentication remain pending.

Design and scope: [plan.md](plan.md). Follow the task order and checkpoints. Write
behavioral tests before implementation where applicable. Regenerate backend
definitions whenever a schema or function contract changes; generated outputs
are additional mechanical files beyond the handwritten files listed below.

## Task 1: Configure Development Identity

**Description:** Select the existing Clerk development instance and intended
Convex development deployment. Configure the issuer/JWT integration and the web
publishable key and deployment URL; record reproducible setup instructions.

**Acceptance criteria:**

- [ ] The selected target is documented as development; production is untouched.
- [ ] Clerk's Convex integration and issuer match the selected deployment, with
      credentials kept in ignored files/provider configuration.
- [ ] The web shell displays real Clerk sign-in controls, and missing configuration
      still produces setup guidance.

**Verification:** Start with `pnpm --filter @mindspool/backend setup`, then
`pnpm dev:backend` and `pnpm dev:web`; complete Clerk sign-in in the browser.
Run `pnpm --filter @mindspool/web build`. Convex data access is verified at Task 4.

**Dependencies:** None; requires the user's instance/project selection.

**Files likely touched:** `README.md`, `packages/backend/convex/auth.config.ts`,
ignored `packages/backend/.env.local`, ignored `apps/web/.env.local`.

**Estimated scope:** Medium: four files, plus provider configuration.

## Task 2: Establish Reproducible Backend Imports

**Description:** Generate the backend definitions, retain them in version control,
and expose typed API imports through the backend package for app consumers.

**Acceptance criteria:**

- [ ] Official generated API/server/data-model definitions exist and are tracked.
- [ ] Backend package exports expose the generated API without app-relative imports.
- [ ] Clean-clone typechecking works without Clerk or deployment secrets, and
      generated files stay excluded from manual formatting.

**Verification:** `pnpm --filter @mindspool/backend codegen`, `pnpm typecheck`,
and `pnpm build`; inspect tracked generated output and repeat checks in an
isolated clean checkout with no `.env.local` files.

**Dependencies:** Task 1.

**Files likely touched:** `packages/backend/package.json`, `.gitignore`;
mechanical outputs in `packages/backend/convex/_generated/`.

**Estimated scope:** Small: two handwritten files, plus generated definitions.

## Task 3: Prove Server-Side Identity

**Description:** Add the backend test harness and a reusable helper that derives
ownership only from verified Convex identity. Put these tests in the root check.

**Acceptance criteria:**

- [ ] Anonymous calls fail; authenticated ownership comes from `tokenIdentifier`,
      including distinct identities with the same subject but different issuers.
- [ ] Vitest/convex-test exercise actual helper behavior with mocked identities;
      the test environment matches the documented backend setup.
- [ ] The backend `test` script uses `vitest run`, and `pnpm check` invokes it.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/auth.test.ts`
and `pnpm check`; prove the tests fail against a deliberately missing/incorrect
identity check before completing the helper.

**Dependencies:** Task 2.

**Files likely touched:** `packages/backend/package.json`,
`packages/backend/vitest.config.ts`, `packages/backend/convex/auth.ts`,
`packages/backend/convex/auth.test.ts`, root `package.json`;
mechanical `pnpm-lock.yaml` update.

**Estimated scope:** Medium: five handwritten files, plus lockfile.

## Checkpoint: Identity Foundation (Tasks 1–3)

- [ ] Backend tests and `pnpm check` pass without runtime credentials.
- [ ] Generated imports are reproducible and no secrets are tracked.
- [ ] Review configuration and ownership contract before library work.

## Task 4: Gate the Web Workspace on Convex Authentication

**Description:** Introduce a minimal authenticated workspace boundary and a
validated identity query. Keep data hooks inactive until Convex verifies sign-in.

**Acceptance criteria:**

- [ ] Missing settings, signed-out state, and authentication loading/failure have
      clear feedback; library hooks do not run outside an authenticated provider.
- [ ] A Clerk-signed-in user reaches the workspace only after Convex accepts their
      token; the identity query rejects anonymous callers.
- [ ] Sign-out hides the workspace and clears user-specific selection state.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/identity.test.ts`,
`pnpm typecheck`, `pnpm --filter @mindspool/web build`; browser checks for valid
sign-in, sign-out, missing configuration, and a rejected issuer/token.

**Dependencies:** Task 3.

**Files likely touched:** `apps/web/src/main.tsx`, `apps/web/src/App.tsx`,
`apps/web/src/Workspace.tsx`, `packages/backend/convex/identity.ts`,
`packages/backend/convex/identity.test.ts`.

**Estimated scope:** Medium: five handwritten files.

## Task 5: Save an Owned Item

**Description:** Introduce Item validators/schema and authenticated create/detail
functions. Preserve original URL/text input independently of future enrichment.

**Acceptance criteria:**

- [ ] Bounded valid URL/text input creates an owned Item with original input,
      capture source, separate optional canonical URL, and explicit processing state.
- [ ] Anonymous and forged-owner requests fail; foreign and nonexistent ids have
      the same response, and invalid input writes nothing.
- [ ] Repeating the same capture key and payload returns the existing Item;
      reusing the key with different input fails. Independent saves remain distinct.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/items.test.ts`
and `pnpm typecheck`; cover retries, invalid schemes, input limits, and two owners.
Validate the development schema with `pnpm dev:backend`.

**Dependencies:** Task 3.

**Files likely touched:** `packages/schema/src/index.ts`,
`packages/backend/convex/schema.ts`, `packages/backend/convex/validators.ts`,
`packages/backend/convex/items.ts`, `packages/backend/convex/items.test.ts`.

**Estimated scope:** Medium: five handwritten files.

## Task 6: Save an Item from the Web

**Description:** Connect a small accessible URL/text save form to the owned create
function. Establish the web's declared backend workspace dependency.

**Acceptance criteria:**

- [ ] A signed-in user saves a URL or text and receives a visible success or error.
- [ ] Pending submission prevents accidental repeat clicks; retries reuse the same
      capture key, and failed submission preserves the user's input.
- [ ] Missing backend configuration never presents a working save form.

**Verification:** `pnpm typecheck` and `pnpm --filter @mindspool/web build`;
browser-save URL and text, simulate a failed request, and retry it successfully.

**Dependencies:** Tasks 4 and 5.

**Files likely touched:** `apps/web/package.json`, `apps/web/src/Workspace.tsx`,
`apps/web/src/SaveItemForm.tsx`, `apps/web/src/style.css`;
mechanical `pnpm-lock.yaml` update.

**Estimated scope:** Medium: four handwritten files, plus lockfile.

## Checkpoint: First Save (Tasks 4–6)

- [ ] Tests and builds pass; development backend accepts schema/functions.
- [ ] Real sign-in → save URL/text → sign-out works in the browser.
- [ ] Anonymous access and incorrect identity configuration cannot save content.
- [ ] Review the first working path before expanding the library.

## Task 7: Browse Owned Items

**Description:** Add indexed, paginated Item listing and a minimal Item detail
panel so users can verify what they saved and reopen it after reload.

**Acceptance criteria:**

- [ ] The inbox lists only the current owner's Items with stable newest-first
      pagination; Item detail preserves original content and shows current status.
- [ ] A second owner sees neither the first owner's list entries nor their detail;
      page-boundary and unknown-id cases are tested.
- [ ] The web handles loading, empty, failure, and load-more states, and saved Items
      remain visible after reload and a new session for the same user.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/items.test.ts`,
`pnpm typecheck`, and web build; browser-save several Items, reload, open details,
and switch accounts.

**Dependencies:** Task 6.

**Files likely touched:** `packages/backend/convex/items.ts`,
`packages/backend/convex/items.test.ts`, `apps/web/src/Workspace.tsx`,
`apps/web/src/ItemList.tsx`, `apps/web/src/ItemDetail.tsx`.

**Estimated scope:** Medium: five handwritten files.

## Task 8: Create a Label

**Description:** Add owned Labels and indexed label-name lookup, with a minimal
web control to create and browse available Labels.

**Acceptance criteria:**

- [ ] Nonblank trimmed names create owned Labels; case-insensitive duplicates
      reuse the same Label for that user, while another owner can use that name.
- [ ] Anonymous access fails and paginated Label listing never crosses owners.
- [ ] The web can create a Label and shows empty, pending, and failed states.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/labels.test.ts`,
`pnpm typecheck`, and web build; create duplicate names and test two owners.

**Dependencies:** Task 7.

**Files likely touched:** `packages/backend/convex/schema.ts`,
`packages/backend/convex/labels.ts`, `packages/backend/convex/labels.test.ts`,
`apps/web/src/Workspace.tsx`, `apps/web/src/LabelList.tsx`.

**Estimated scope:** Medium: five handwritten files.

## Task 9: Manage Multiple Labels on an Item

**Description:** Introduce item-label relationships and connect attachment/removal
controls to Item details, retaining explicit manual decisions.

**Acceptance criteria:**

- [ ] One Item can have multiple Labels and one Label can contain multiple Items;
      repeated attach/remove calls are idempotent, with one relationship per pair.
- [ ] Both Item and Label ownership are verified; mixed-owner assignments fail
      atomically and change no membership.
- [ ] Removal hides membership without deleting either endpoint and retains a
      manual exclusion; the web shows pending/errors and final persisted Labels.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/itemLabels.test.ts`,
`pnpm typecheck`, and web build; assign two Labels to one Item, share a Label with
a second Item, remove/reassign, and reload.

**Dependencies:** Task 8.

**Files likely touched:** `packages/backend/convex/schema.ts`,
`packages/backend/convex/itemLabels.ts`,
`packages/backend/convex/itemLabels.test.ts`, `apps/web/src/ItemDetail.tsx`,
`apps/web/src/ItemLabelControls.tsx`.

**Estimated scope:** Medium: five handwritten files.

## Checkpoint: Library Membership (Tasks 7–9)

- [ ] Full backend tests, typechecks, and builds pass.
- [ ] Save → open Item → assign several Labels → remove one → reload works.
- [ ] Cross-owner relationship and duplicate membership tests pass.
- [ ] Review membership semantics before navigation and processing work.

## Task 10: Browse the Library in Both Directions

**Description:** Add indexed relationship queries and label selection in the web
workspace. Connect Item Labels to their corresponding Label views.

**Acceptance criteria:**

- [ ] Opening a Label lists its assigned Items with pagination; opening an Item
      shows its assigned Labels and allows navigation to those Label views.
- [ ] Removed memberships disappear from both directions; empty Labels remain
      valid, and querying foreign ids reveals no data.
- [ ] Pagination handles an Item under several Labels without duplicating it
      within a single Label view; the user can return to the full inbox.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/itemLabels.test.ts`,
`pnpm typecheck`, and web build; browser-check both navigation directions, empty
Labels, multiple pages, and account switching.

**Dependencies:** Task 9.

**Files likely touched:** `packages/backend/convex/itemLabels.ts`,
`packages/backend/convex/itemLabels.test.ts`, `apps/web/src/Workspace.tsx`,
`apps/web/src/LabelList.tsx`, `apps/web/src/ItemDetail.tsx`.

**Estimated scope:** Medium: five handwritten files.

## Task 11: Record Processing History

**Description:** Introduce Processing Runs with internal attempt/result writes
and an authenticated history query, without calling decision providers.

**Acceptance criteria:**

- [ ] Runs preserve Item ownership, attempt status, versioned rubric/question
      references, optional provider/model/modality/results/measurements, and failures.
- [ ] Public callers cannot fabricate worker results or a Run owner; the history
      query is indexed/paginated and rejects foreign Items.
- [ ] Failed or absent processing does not remove original saved content; optional
      measurements remain absent unless actually available.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/processingRuns.test.ts`
and `pnpm typecheck`; drive internal functions through convex-test with fixed
fixtures and check success/failure history and owner isolation.

**Dependencies:** Task 10.

**Files likely touched:** `packages/schema/src/index.ts`,
`packages/backend/convex/schema.ts`, `packages/backend/convex/validators.ts`,
`packages/backend/convex/processingRuns.ts`,
`packages/backend/convex/processingRuns.test.ts`.

**Estimated scope:** Medium: five handwritten files.

## Task 12: Protect Manual Label Decisions

**Description:** Prove that recording new model suggestions preserves both manual
additions and manual exclusions. Expose history/status in Item detail.

**Acceptance criteria:**

- [ ] Recording later suggestions never overwrites or reattaches a manually
      excluded Label; manual additions survive suggestions that omit that Label.
- [ ] Suggestions reference only the Run owner's Labels; wrong-owner results and
      attempts to mutate another user's Run fail without partial writes.
- [ ] Item detail distinguishes current manual Labels from suggested Labels and
      pending/failed processing; no model execution or automatic application occurs.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/processingRuns.test.ts`,
`pnpm typecheck`, and web build; inspect fixed suggestion fixtures in development
and prove membership remains unchanged across successive Runs.

**Dependencies:** Task 11.

**Files likely touched:** `packages/backend/convex/processingRuns.ts`,
`packages/backend/convex/processingRuns.test.ts`,
`packages/backend/convex/itemLabels.test.ts`, `apps/web/src/ItemDetail.tsx`,
`apps/web/src/ProcessingHistory.tsx`.

**Estimated scope:** Medium: five handwritten files.

## Checkpoint: Core Flow (Tasks 10–12)

- [ ] The signed-in save → multi-label → browse-both-directions flow works.
- [ ] All public read/write paths have anonymous and cross-owner coverage.
- [ ] Suggestions and failed Runs preserve original content and manual decisions.
- [ ] Review the core concepts before inserting sample content.

## Task 13: Seed Repeatable Development Examples

**Description:** Add an explicitly invoked, authenticated development seeder with
varied URL/text/image-reference examples, Labels, and versioned sorting rubrics.
Expose a "Load examples" control only when the backend reports that development
seeding is enabled; the mutation enforces the same flag independently of the UI.

**Acceptance criteria:**

- [ ] Repeating the seed for one owner does not duplicate Items, Labels, or links;
      seeding a second owner creates a separate private set.
- [ ] Fixtures include image/screenshot references and multi-label examples, while
      clearly distinguishing references from uploaded/available image binaries.
- [ ] Seeding is disabled unless explicitly enabled on the development target;
      it performs no remote scraping/model calls and preserves existing edits.

**Verification:** `pnpm --filter @mindspool/backend test -- convex/seed.test.ts`
and `pnpm typecheck`; invoke twice on development, verify isolation and disabled
behavior, and inspect sample Items through the web Label views.

**Dependencies:** Task 12.

**Files likely touched:** `packages/backend/convex/sampleContent.ts`,
`packages/backend/convex/seed.ts`, `packages/backend/convex/seed.test.ts`,
`apps/web/src/Workspace.tsx`.

**Estimated scope:** Medium: four handwritten files.

## Task 14: Verify the Completed Foundation

**Description:** Review and exercise the complete increment, update setup/core
concept documentation, and record actual evidence plus any remaining limitations.

**Acceptance criteria:**

- [ ] `pnpm check` and the Firefox compatibility build pass; clean-clone checks
      work without runtime credentials and no generated definitions are stale.
- [ ] Real-browser tests cover sign-in/out, account switching, saving, multiple
      Labels, both navigation directions, failures, and persistence after reload.
- [ ] Documentation describes implemented behavior accurately; unresolved live
      checks remain explicitly incomplete rather than reported as verified.

**Verification:** `pnpm check`,
`pnpm --filter @mindspool/extension build:firefox`, clean-checkout verification,
Chrome DevTools browser checks, and final diff/security review. Fixes discovered
here become focused follow-up tasks before the final checkpoint is checked.

**Dependencies:** Task 13.

**Files likely touched:** `README.md`, `docs/core-concepts.md`, `tasks/plan.md`,
`tasks/todo.md`, `docs/verification/library-foundation.md`.

**Estimated scope:** Medium: five documentation files; verification is read-only.

## Checkpoint: Complete (Tasks 13–14)

- [ ] Every task's acceptance criteria and required verification passed.
- [ ] Sample content and rubrics are available for the next experiment phase.
- [ ] No production data or settings changed; all credentials stay untracked.
- [ ] Review final behavior and evidence before integrating the change.
