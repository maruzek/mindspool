# Tasks: Hosted MCP account access

Spec: [SPEC-mcp-access.md](../../SPEC-mcp-access.md). Plan: [plan.md](mcp-access-plan.md).
Status: implementation started, 2026-10-16. Tasks 1–3 and Checkpoint A are complete; Tasks 4 and 5 are complete; Checkpoint B is ready for review. Commands run from the isolated checkout root.
The task steps below are the checklist of record; no external tracker is used.
Read each task with the plan's global constraints and interface contracts.

For behavior changes, use a failing security/behavior test, the smallest passing
implementation, focused verification, then a scoped commit. Never add a production
stub to keep a dependency chain green. Proof/documentation tasks report evidence
rather than fabricate a red/green cycle.

## Task 1: Establish the Clerk and existing-owner proof

**Dependencies:** none. **Scope:** small, evidence only.
**Files:** `docs/verification/mcp-access.md`, `docs/mcp.md`.
**Consumes:** the approved spec and the actual development Clerk/Convex configuration.
**Produces:** a redacted provider capability table and concrete field/identity mappings
for `VerifiedMcpClaims`, plus exact provider revocation/active-user procedures.

- [x] Classify the selected Clerk and Convex instances as development without
      printing secrets. Inspect custom-scope/CIMD availability, consent defaults, PKCE,
      resource indicators, token verification response, refresh and grant revocation.
- [x] With development browser sign-in, compare the same user's OAuth subject to
      the existing Convex owner identifier. Try a second resource/environment and record
      how tokens issued for it are rejected. Record client identities and redacted field
      names, never raw credentials. Determine how deleted/disabled users are detected.
- [x] Record each proof as passed, failed, or blocked, with source and environment.
      If resource binding is absent, present the concrete failed proof before any
      production feature implementation. Do not equate client ID with audience.

Progress: development setup now confirms opaque tokens, required PKCE, restricted
CIMD, audience validation enabled, and an exact `mindspool:read` default. The user
saved the dashboard settings; a previewed development-only API patch enabled audience
validation and removed email/profile from defaults. Both real client metadata URLs
are verified; the user completed registration and both scopes are now advertised.
Both authorization starts redirect to development sign-in. A temporary local
read-only provider proof uses the user's browser consent; its exact resource
uses the configured `eu-west-1.convex.site` origin. The ordinary OAuth application
list does not establish CIMD registry state.
The configured session issuer matches the development Clerk issuer. Both provider
consent, real token/audience, existing owner mapping, active-user lookup, refresh,
and revocation passed. The hosted probe also confirms the exact web identity owner.
A real second-resource grant was rejected before user/library lookup and revoked;
inactive-account negative cases remain
in the planned verifier/lifecycle tests. This is not actual CLI MCP
connection evidence. See
[the evidence](../../docs/verification/mcp-access.md).

**Acceptance:** user/client/resource identity is demonstrable; existing owner maps
exactly; revocation/refresh/active-user behavior is evidenced or explicitly blocks A.
**Verify:** inspect the redacted evidence against the spec; no unchecked assumption
is marked confirmed. `pnpm exec prettier --check docs/verification/mcp-access.md docs/mcp.md`.
**Commit:** `docs: record development MCP authorization proof`.

## Task 2: Prove the pinned SDK's stateless handler locally

**Dependencies:** none; can proceed while Task 1's provider evidence is pending.
**Scope:** medium, four files.
**Files:** `packages/backend/package.json`, `pnpm-lock.yaml`,
`packages/backend/convex/mcp/transport.ts`, `packages/backend/convex/mcp/transport.test.ts`.
**Consumes:** official server/client 2.3.1 package exports.
**Produces:** `createMcpTransportHandler({ registerTools }): (request: Request) => Promise<Response>`,
where `registerTools` is `(server: McpServer) => void`. The proof passes an empty
registration; later production callers supply their principal-bound registration.

- [x] Review the exact dependency tarballs/provenance and script policy. Add the
      pinned server/Zod runtime dependencies and client test dependency with pnpm;
      do not blanket-enable dependency scripts. Confirm these package imports bundle
      without a Node HTTP listener or dynamic unsupported code generation.
- [x] Write real SDK client/handler tests for initialize, `notifications/initialized`,
      empty `tools/list`, JSON response, and unsupported protocol. One concrete assertion:

  ```ts
  const response = await handle(initializeRequest());
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.has("mcp-session-id")).toBe(false);
  ```

  `initializeRequest()` is a local test helper constructing an SDK-valid initialize
  message with client info and negotiated supported version. It supplies no auth
  because the production authorization wrapper is a later, separate boundary.

- [x] Run the focused test red, then implement the SDK factory with stateless JSON
      transport. Run green and backend typecheck. Keep request state isolated and close
      resources after each completed response.

Progress: `c195cce` implements the pinned factory. Nine real SDK tests pass; backend
typecheck and the full backend suite passed (292 tests at this checkpoint).
`pnpm install --frozen-lockfile` passes; existing build-script policy is unchanged.

**Acceptance:** actual SDK handles the lifecycle; no stateful sessions or Node-server
adapter; exact versions and lockfile are reproducible.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcp/transport.test.ts`;
`pnpm --filter @mindspool/backend typecheck`; `pnpm install --frozen-lockfile` with
the reviewed script policy.
**Commit:** `feat: add stateless MCP transport foundation`.

## Task 3: Prove the handler inside a development Convex deployment

**Dependencies:** 2. **Scope:** medium, four files.
**Files:** `packages/backend/convex/http.ts`, `packages/backend/convex/mcp/proof.ts`,
`packages/backend/convex/mcp/proof.test.ts`, `docs/verification/mcp-access.md`.
**Consumes:** `createMcpTransportHandler({ registerTools })` with empty registration,
and existing `requireOwner`.
**Produces:** development-only `/__mcp_probe` evidence; this is not the final endpoint.

- [x] Test that the probe returns `404` unless `MINDSPOOL_ENVIRONMENT=development`
      and `MINDSPOOL_MCP_PROOF_ENABLED=true`, and refuses anonymous/foreign disallowed
      callers even when enabled. It uses the existing app JWT only for this temporary
      development probe, returns no library data, and allocates no durable session.
- [x] Add the guarded HTTP action. Classify the deployment, then bundle/deploy
      once with `pnpm --filter @mindspool/backend exec convex dev --once --typecheck enable`.
      Exercise initialize/notification/list against the real route with a development
      user's existing authentication, without printing its token.
- [x] Run two interleaved authenticated callers, verify responses stay independent,
      and record runtime compatibility, bundle result, timing, versions, and failures.
      Disable the proof flag after the check; Task 7 removes the route.

Progress: complete. Merged the four newer library commits into this isolated branch
and preserved the current dev features; original checkout unchanged. The classified
development deployment accepted the bundle. Actual authenticated initialize,
notification, and empty-list calls passed with two distinct existing browser sessions
of the same owner, independent IDs, JSON responses, and no session headers. Observed
latency 186–248 ms; anonymous requests returned 401. The probe flag was removed and
disabled 404 verified. The real web identity query matches OAuth ownership exactly.
Distinct-user isolation remains covered by local route tests.

Foundation verification: `pnpm check` passes after branch integration (967 tests, workspace typechecks and
builds); Firefox build passes. Fresh independent review found no issues in Tasks 1–3.
The real second-resource provider proof also passed.

**Acceptance:** actual Convex runtime handles SDK requests; probe is unavailable in
production; no credential or content escapes into evidence.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcp/proof.test.ts`;
backend typecheck and real deployed probe results in the evidence file.
**Commit:** `test: verify MCP transport in development Convex`.

### Checkpoint A: Feasibility

- [x] Tasks 1–3 pass, including real intended-resource rejection, exact owner
      mapping, active-user checks, and deployed runtime proof. No production touched.
- [x] Review evidence and exact pinned dependencies with the user. Resolve any
      failed/blocked proof by revising the spec/plan before Task 4.

## Task 4: Normalize verified claims into the existing owner identity

**Dependencies:** A. **Scope:** medium, five files.
**Files:** `packages/backend/convex/mcp/types.ts`, `mcp/config.ts`, `mcp/config.test.ts`,
`mcp/auth.ts`, `mcp/auth.test.ts` (all under `packages/backend/convex/`).
**Consumes:** Task 1's verified provider fields and issuer mapping.
**Produces:** `VerifiedMcpClaims`, `VerifiedMcpPrincipal`, `McpScope`, `ConnectionCapabilities`,
`readMcpConfig()`, `verifyMcpAccessToken(request, config, signal)`, and
`ownerIdForMcpSubject(subject, configuredSessionIssuer)`.

- [x] Add refusal tests: wrong issuer/resource/client, missing subject, session/ID
      tokens, expired/revoked tokens, disabled/deleted user, disallowed account, malformed
      provider response, and timeout. The owner-mapping regression uses the existing fixture:

  ```ts
  expect(
    ownerIdForMcpSubject("user_1", "https://first.clerk.accounts.dev"),
  ).toBe("https://first.clerk.accounts.dev|user_1");
  ```

  Also assert that substituting another issuer cannot select that same owner's clips.

- [x] Run red, then implement strict configuration and provider-response validation
      using the recorded schema. Verify OAuth token and active-user status on each
      request under one five-second deadline. Fixed provider URLs only; no fetch of a
      client-supplied issuer, resource, token URL, or metadata URL.
- [x] Run green. Verify provider faults produce unavailable errors, credentials
      never appear in thrown messages, and foreign/missing claims cannot reach internal
      library operations. Do not change `auth.config.ts` or browser auth semantics.

**Acceptance:** principal input is proven identity, not caller assertion; exact
owner mapping; no verification success cached across requests.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcp/auth.test.ts convex/mcp/config.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.
**Commit:** `feat: verify scoped MCP account identity`.

## Task 5: Implement the connection lifecycle with owner-scoped app controls

**Dependencies:** 4. **Scope:** medium, four authored files.
**Files:** `packages/backend/convex/schema.ts`, `mcpValidators.ts`,
`mcpConnections.ts`, `mcpConnections.test.ts`.
**Consumes:** verified subject/client/scopes internally; existing web `requireOwner` publicly.
**Produces:** `mcpConnections.authorize` (internal mutation), plus public
`configuration`, `list`, `setLabelWrite`, `disconnect`, and `reconnect` with the
plan's exact inputs.

- [x] Write two-owner lifecycle tests and concurrent-first-request/revocation tests.
      Include this transition: app write-enable plus token write scope permits editing;
      app downgrade refuses that same still-valid token; reconnect resets to read-only.

  ```ts
  expect(readOnlyPrincipal.scopes).not.toContain("mindspool:labels:write");
  ```

  Assert both the record's app permission and the returned principal's effective
  scopes; possession of token scope alone must not enable editing.

- [x] Run red; add the indexed table and transactional lookup/create/authorization.
      Implement public controls with authenticated owner checks and ten-row pagination.
      Do not delete tombstones or permit public owner/principal arguments. Do not add
      a reference to the provider-revocation scheduler until its Task 11 implementation.
- [x] Run green for one record under concurrent creation; revoke wins against later
      authorization; anonymous/foreign public actions fail; replaying an old token cannot
      reactivate a record; repeat disconnect is safe. Generate required Convex types and
      verify no generated API accidentally makes `authorize` public.

**Acceptance:** initial access read-only; permission intersection is enforced;
owner-only revocation/reactivation is durable and retry-safe.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcpConnections.test.ts convex/auth.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.
**Commit:** `feat: manage owner-scoped MCP connections`.

### Checkpoint B: Authorization

- [x] Backend tests/typecheck pass; anonymous/foreign access and scope bypass fail.
- [ ] Review connection schema and revocation races before publishing `/mcp`.

## Task 6: Enforce shared admission quotas

**Dependencies:** B. **Scope:** medium, four files.
**Files:** `packages/backend/convex/schema.ts`, `mcpValidators.ts`,
`mcpRateLimit.ts`, `mcpRateLimit.test.ts`.
**Consumes:** trusted clock and opaque connection ID, never raw token/IP identity.
**Produces:** internal `admitIngress({ now })` and
`admitConnection({ connectionId, isWrite, now })` with `{ allowed, retryAfterSeconds }`.

- [x] Freeze time in tests. Admit requests 1–120, refuse 121, reset at next UTC
      minute; admit writes 1–30, refuse 31; verify one owner cannot consume another's
      bucket and concurrent calls never exceed a window quota.

  ```ts
  expect(denied).toEqual({ allowed: false, retryAfterSeconds: 17 });
  ```

  Here the test clock is 43 seconds into the fixed window. Cover global verification
  admission 300/301 and prove a refused write does not consume a request admission.

- [x] Run red; implement indexed, transactional buckets with a two-minute expiry.
      Caller-supplied timestamps are internal only and obtained from the handler clock.
      No read-then-write outside a transaction or process-local fallback.
- [x] Run green with window-boundary burst behavior explicitly asserted and documented.

**Acceptance:** shared quotas survive independent workers; atomic write admission;
bounded records and deterministic `Retry-After`.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcpRateLimit.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.
**Commit:** `feat: bound MCP request admission`.

## Task 7: Expose the authenticated connection tool and metadata

**Dependencies:** 4–6. **Scope:** medium, five files.
**Files:** `packages/backend/convex/http.ts`, `mcp/handler.ts`, `mcp/handler.test.ts`,
`mcp/tools.ts`, `mcp/tools.test.ts`.
**Consumes:** verified claims, internal authorization/quota functions, SDK transport.
**Produces:** production-shaped `/mcp`/metadata routes,
`handleMcpRequest(request, services): Promise<Response>`,
`connectionCapabilities(principal): ConnectionCapabilities`, and
`requiredScopesForTool(name): readonly McpScope[] | null`.

- [ ] Write handler tests for full lifecycle with two interleaved principals,
      identical structured/text status output, strict empty tool arguments, metadata
      without auth, origin/host checks, `401` discovery, insufficient-scope `403`, revoked
      connection `403`, quotas `429`, provider outage `503`, and authenticated `405`.
      A named harmless write-test registration proves direct-call scope denial:

  ```ts
  expect(response.status).toBe(403);
  expect(writeEffect).not.toHaveBeenCalled();
  ```

  Include actual/chunked oversized bodies, unsupported encoding/version, accepted
  notifications, unsupported tool names, and deadline behavior. The test-only tool
  is injected through services and is never registered by production wiring.

- [ ] Run red; compose the real wrapper and registry. Enforce read-only initial
      challenges, fixed metadata URLs, stateless per-request server construction,
      closed tool dispatch, and a 15-second deadline. Remove the probe route and its
      runtime registration; its guarded helper remains isolated in the existing proof
      tests and is never imported by production HTTP wiring.
- [ ] Run green and redeploy only to classified development. Use the actual SDK
      client against the route to verify lifecycle and the connection tool. No token
      passthrough, arbitrary Convex executor, sampling, or shell capabilities.

**Acceptance:** real hosted status tool; OAuth/protocol/domain errors stay distinct;
known hidden write tools cannot bypass scope checks.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcp/handler.test.ts convex/mcp/tools.test.ts`;
backend typecheck and development HTTP smoke evidence.
**Commit:** `feat: serve authenticated MindSpool MCP access`.

## Task 8: Record safe diagnostics with bounded retention

**Dependencies:** 7. **Scope:** medium, five files.
**Files:** `packages/backend/convex/schema.ts`, `mcpValidators.ts`,
`mcpDiagnostics.ts`, `mcpDiagnostics.test.ts`, `mcp/handler.ts`.
**Consumes:** request ID, optional connection reference, known tool/outcome, duration.
**Produces:** internal `recordMcpEvent({ requestId, connectionId?, tool?, outcome, durationMs })`.

- [ ] Test strict payloads and expiry: allowed fields only, no raw provider error,
      headers, tokens, argument objects, query text, title, URL, email, or subject.
      Inspect serialized stored rows with sentinel secrets and assert their absence.
- [ ] Run red; add expiry/connection-indexed diagnostics and call the safe recorder
      from success/failure paths. Clamp event strings/numbers, set a seven-day expiry,
      and keep provider payloads out of platform logs. A diagnostic-storage failure
      must not change a completed tool's outcome or retry its operation.
- [ ] Run green; demonstrate `401`, `403`, `429`, provider failure, and successful
      call produce useful outcome/timing records without sensitive content.

**Acceptance:** diagnosable access lifecycle; explicit retention and no payload logging;
diagnostic failure cannot duplicate a future write.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcpDiagnostics.test.ts convex/mcp/handler.test.ts`;
`pnpm --filter @mindspool/backend typecheck`.
**Commit:** `feat: record bounded MCP access diagnostics`.

### Checkpoint C: Hosted backend flow

- [ ] A development account connects through browser OAuth and calls the real
      connection tool. Direct unauthorized calls and deliberate resource mismatch fail.
- [ ] Backend tests/typecheck and observed response budgets pass. Review safe
      diagnostics and the fixed-window quota limitation before building the settings UI.

## Task 9: Ship authenticated connection management in the web app

**Dependencies:** 5, C. **Scope:** medium, five files.
**Files:** `apps/web/src/integrations/IntegrationsPage.tsx`, `IntegrationsPage.test.tsx`,
`apps/web/src/routes/_app/settings.integrations.tsx`,
`apps/web/src/shell/nav.ts`, `apps/web/src/routeTree.gen.ts`.
**Consumes:** public `mcpConnections` list/actions, existing auth gate and UI primitives.
**Produces:** `/settings/integrations`, discoverable via sidebar navigation.

- [ ] Write component tests for loading, no connections, paginated/error states,
      granted/effective permission copy, enable/disable, disconnect/reconnect, pending
      controls, keyboard access, and same-client/all-devices wording. Query the safe
      `configuration` API for enabled state and endpoint URL. Switch accounts
      while a mutation is pending; its late response must not update the new account UI.
- [ ] Run red; implement the page within existing tokens/components. Explain read
      access shares saved content with the client; scope enablement does not grant OAuth
      scope by itself; reconnect clears write enablement; web sign-out is not disconnect.
      Keep server errors visible without assuming a rejected mutation changed state.
- [ ] Run green, regenerate the route tree through the existing build, and inspect
      the actual development page at desktop/mobile widths through the T3 browser.

**Acceptance:** signed-in owners can manage only their connections; all lifecycle
states are usable; account switching cannot leak UI state.
**Verify:** `pnpm --filter @mindspool/web test -- src/integrations/IntegrationsPage.test.tsx`;
web typecheck/build and browser keyboard/390px/1440px checks.
**Commit:** `feat: manage MCP connections in MindSpool settings`.

## Task 10: Provide tested client setup and permission-upgrade instructions

**Dependencies:** 7, 9. **Scope:** medium, four files.
**Files:** `apps/web/src/integrations/ClientSetup.tsx`, `ClientSetup.test.tsx`,
`IntegrationsPage.tsx`, `docs/mcp.md`.
**Consumes:** deployment-controlled canonical resource URL, never a clip/client-supplied URL.
**Produces:** copyable read-only connection commands and explicit write-upgrade steps.

- [ ] Test correct environment URL, safe rendering/copying, setup for both clients,
      unavailable configuration, and the distinction between Claude configuration
      `--scope user` and actual OAuth permission. Do not interpolate untrusted client
      display names into shell commands.
- [ ] Implement the setup component and record the exact commands confirmed against
      installed CLI help. Codex read-only setup uses `codex mcp add` then
      `codex mcp login mindspool --scopes mindspool:read`; write upgrade requests
      `mindspool:read,mindspool:labels:write` after app enablement. For Claude, test
      HTTP add plus `/mcp` authentication and its configured OAuth scopes; prefer CIMD
      and document a pre-registered public client only when that fallback is demonstrated.
- [ ] Run component tests and record the actual consent/permission result in both
      clients; do not assume advertised scopes or clearing local credentials proves
      effective authorization or revocation. Document troubleshooting and reconnect.

**Acceptance:** users can connect without copying bearer secrets; read-only is
verified; write upgrade names both required grants.
**Verify:** `pnpm --filter @mindspool/web test -- src/integrations/ClientSetup.test.tsx`;
web typecheck/build; actual instructions exercised in both CLI versions.
**Commit:** `feat: guide Codex and Claude MCP setup`.

### Checkpoint D: Usable account controls

- [ ] Both clients complete read-only setup, and settings actions match observed
      server permissions. No write tool is claimed to exist in this module.
- [ ] Web tests/typecheck/build pass; real browser checks cover layout and keyboard.

## Task 11: Complete provider revocation and bounded maintenance

**Dependencies:** 5, 6, 8, D. **Scope:** medium, five files.
**Files:** `packages/backend/convex/mcpMaintenance.ts`, `mcpMaintenance.test.ts`,
`crons.ts`, `mcpConnections.ts`, `mcpConnections.test.ts`.
**Consumes:** Task 1's exact provider revocation/deletion capabilities and expiry indexes.
**Produces:** scheduled provider cleanup following local disconnect; internal bounded
`cleanupExpired` and `purgeDeletedAccount` operations; a five-minute maintenance schedule.

- [ ] Test disconnect commits locally even if provider cleanup fails. Test expired
      buckets/events deleted in batches of at most 100, continuations drain larger sets,
      and events become cleanup-eligible 15 minutes before their seven-day maximum.
      and revoked active-account tombstones survive unlimited refresh lifetime.
      Provider timeouts/errors must never be interpreted as account deletion.
- [ ] Run red; implement supported provider grant revocation using fixed provider
      endpoints and server credentials, as established by Task 1. If automatic grant
      revocation is unsupported, record the provider's supported manual procedure;
      keep the local block authoritative. Schedule only after local revocation.
- [ ] Implement internal account purge only after verified provider deletion,
      removing owner connection/diagnostic rows in bounded transactions; disabled
      accounts retain revocation state. Add the expiry-cleanup cron and run green.
      Avoid scanning all account documents on each request or storing raw tokens.

**Acceptance:** provider faults cannot restore access; diagnostics are removed
within seven days, including the tested cleanup scheduling margin; live active-user checks
deny deleted accounts before lazy creation can recreate a grant.
**Verify:** `pnpm --filter @mindspool/backend test -- convex/mcpMaintenance.test.ts convex/mcpConnections.test.ts`;
backend typecheck and development cleanup/revocation evidence.
**Commit:** `feat: maintain MCP revocation and retention`.

## Task 12: Prove both real-client lifecycles and close the access module

**Dependencies:** 1–11. **Scope:** small, evidence only.
**Files:** `docs/verification/mcp-access.md`, `docs/mcp.md`.
**Consumes:** the actual hosted development endpoint, both CLI clients, settings UI.
**Produces:** per-client acceptance matrix with versions, timing, results, limitations.

- [ ] For both clients, exercise approve/deny, read-only status, app enablement plus
      OAuth write scope, app downgrade, refresh, local disconnect with old/new access
      tokens, provider revocation, active-account restriction, disabled/deleted account,
      and explicit reconnect. Confirm a timed-out/replayed request never gains permission
      and no status output exposes identity or credentials. Use only disposable dev users.
- [ ] Verify existing browser auth/library still work and another owner cannot read
      the first owner's connections. Record no claim of clip search or label mutation;
      injected write tests prove authorization only. Record provider/account/runtime
      costs or limits actually encountered; confirm the temporary probe route is absent
      and test-only proof helpers are not imported by production wiring.
- [ ] Run final checks below, redact evidence, review the diff, and commit only
      observed results. Leave any unverified result open with its concrete blocker.

**Acceptance:** all six access-spec success criteria have executable/runtime evidence;
no production changed; next module can reuse the verified principal/dispatch contract.
**Verify:** read installed Turbo task-running docs before `pnpm check`; then
`pnpm check` and `pnpm --filter @mindspool/extension build:firefox`.
**Commit:** `docs: verify MCP access in Codex and Claude Code`.

### Checkpoint E: Access acceptance

- [ ] All access success criteria pass with real-client evidence and regression checks.
- [ ] Human reviews outcome and remaining limitations. Production deployment and
      `mcp-discovery`/`mcp-labels` implementation remain separate authorized work.
