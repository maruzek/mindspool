# Library foundation verification

Date: 2026-10-04. Branch: `feature/library-foundation`.

## Development configuration

- Existing Clerk application **MindSpool**, development instance
  `ins_3KDcmL8sB1uT4tufKvQ2ZmgK1Ic`, is linked through the CLI.
- Existing Convex project `martin-ruzek/mindspool`, personal development deployment
  `graceful-stork-346`, region `eu-west-1`, is selected.
- Development Clerk issuer and `convex` JWT template (audience `convex`) are
  configured. The web's ignored environment file contains the development keys
  and Convex URL. Production configuration was not changed.
- `convex dev --once --typecheck enable` validates and syncs the backend. A
  Convex-local tsconfig extends the shared strict workspace configuration.
- The current development deployment explicitly enables the example loader.

## Automated verification

- `pnpm check`: formatting, 39 backend behavioral tests and six web regressions, workspace typechecks,
  web and Chrome extension bundles, and Android JavaScript export pass.
- `pnpm --filter @mindspool/extension build:firefox` passes. This establishes
  compilation compatibility; native/Firefox authentication is outside this scope.
- An isolated `git archive` checkout at `892d69f`, with no `.env.local` files,
  installs using `pnpm install --frozen-lockfile` and passes `pnpm check` with
  45 tests. Its app builds have no Clerk/Convex credentials.
- Ownership regression experiment: inverting the owner comparison makes the
  focused tests fail; restoring the original code returns the suite to green.
- Review reproduced two failures with reactive pagination `endCursor` ranges.
  Hard row limits now bound joined Item reads and Run suggestion lookups even
  when ranges grow; both regression tests pass and retain all records across pages.
- Live public HTTP queries reject anonymous identity access and a forged JWT.
  Public clients also cannot invoke internal worker writes. These are endpoint checks, rather than an altered-issuer browser configuration.

Tests cover original input, capture retries, invalid input and forged owner args,
anonymous and cross-owner access, two issuers with the same subject, label-name
normalization, membership tombstones, pagination, internal worker ownership,
terminal Run immutability, stale enrichment completion, manual decision retention,
measurements/suggestion validation, and repeatable opt-in seeding.

## Real browser evidence

Chrome DevTools MCP ran Chromium in an isolated profile against the local Vite
server and the selected real development backend. UI interaction used ordinary
click/fill/key tools; JavaScript evaluation inspected rendered DOM and styles.

Verified:

- Clerk password sign-in plus development email verification reaches the workspace
  after Convex authenticates the token.
- Invalid `javascript:` URL is rejected; the save form retains the input. A valid
  URL and text save succeed, with original text whitespace retained.
- Creating two Labels, assigning both to one Item, navigating Item → Label → Item,
  and removing one assignment work. The empty Label remains usable, and reload
  retains Items and the manual removal.
- Loading examples twice adds three Items once and retains existing memberships.
- The second account loads its own separate examples. A temporary pagination
  fixture yields 24 unique Items in one Label across pages of 10, 10, and 4,
  with no duplicate entries and no remaining load-more control on the last page.
- Fixed internal processing fixtures show successful suggestions and failed
  extraction in history. A manually removed suggested Label remains unchecked;
  the manually added Label and original text remain intact. No AI calls occurred.
- Sign-out removes the save form, Item detail, and library list from the DOM.
- Layout widths 320, 768, 1024, and 1440 have no horizontal overflow. At 320 the
  library stacks vertically; wider screens use the Label sidebar. Tab navigation
  produces a visible focus outline. Accessibility snapshots expose named inputs,
  headings, navigation, status, and error regions.

- Account switching starts the second user with no Items, no private Labels from
  the first account, and no old Item selection. The deployed detail function
  rejects the second identity's attempt to read the first user's Item.
- A brief network interruption retains the input and disables repeat submission
  until the pending save succeeds after reconnecting.
- A longer outage exposed an unsaved-input loss when authentication expired.
  The fix lifts session-scoped drafts outside the Convex workspace boundary,
  restores them through best-effort session storage after Reconnect, and retains
  retry keys. Six web regressions cover retries, account/sign-out clearing,
  reload, malformed storage, long text mode-switching, stale key purging, and
  late completion. The real long-outage retest displays the retained draft after
  authentication failure. Reconnect restores the exact input; retry succeeds and
  clears the saved draft.

## Fixture cleanup

The user explicitly approved creation and cleanup of two temporary development
users. Both Clerk accounts were deleted, and the development instance's user list
is empty again. Cleanup removed 74 records owned by those identities, including
pagination fixtures, samples, memberships, and processing history. A scoped query
checks that neither owner has remaining Items, Labels, memberships, or Runs.
Temporary internal fixture/cleanup helpers are removed from the repository and
the final development backend sync. Local password payloads are deleted and the
isolated browser session is closed after verification.

## Review and remaining platform work

The code-review skill's separate-model review found the two pagination bounds
above; both are fixed. It found no additional ownership, public/internal worker
exposure, manual-decision, or enrichment-concurrency defects.

`pnpm audit --prod` reports three existing transitive advisories in Expo tooling:
`node-forge` and `braces` (high, audit reports no patched version), and `uuid`
(moderate, under Expo/xcode). These dependencies predate this increment. No bulk
or forced overrides were applied; review an Expo-supported update separately.

A device/native development build, extension-origin registration and sign-in,
browser UI with a deliberately different issuer, and a full assistive-technology audit are not verified here. Backend
retry/ownership tests and live forged-token rejection cover their related data
contracts without claiming those platform scenarios passed.
