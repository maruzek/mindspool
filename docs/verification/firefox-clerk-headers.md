# Firefox Clerk request headers

Date: 2026-10-14.

Firefox sends an `Origin` header on extension POST requests. In production,
`@clerk/chrome-extension` 3.1.90 also attaches `Authorization` and `_is_native=1`.
Clerk rejects this combination with HTTP 400, preventing the background handler
from obtaining a Convex token and saving a clip. Development authentication uses
a different transport, so previous checks with development keys missed it.

The Firefox background now registers a synchronous `onBeforeSendHeaders`
listener before loading Clerk. It removes `Origin` only when the request comes
from this installation, targets the configured Clerk origin, includes
`_is_native=1`, and already carries authorization. Other requests and headers
are preserved. Only Firefox requests `webRequest` and `webRequestBlocking`;
the Chrome build excludes the listener and those permissions.

The implementation follows Mozilla's
[header modification API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeSendHeaders).

## Verification

- Disabling header removal makes both positive regression tests fail;
  restoring it passes all 13 header tests.
- All 125 extension tests pass with `vitest run --maxWorkers=1`. The default
  parallel run hit the existing five-second timeout in the Reddit comment
  selection test; no timeout or existing test was changed.
- Extension typecheck and Firefox/Chrome production-mode builds pass.
- Generated manifests and bundles confirm the additional permissions and
  listener appear only in Firefox.
- An isolated Firefox 144.0.2 profile loaded a temporary MV3 test add-on using
  the real header helper and the same listener registration. A local HTTP
  server observed `Authorization` without `Origin` on the native POST. A POST
  without `_is_native=1` retained both headers; an unauthenticated POST retained
  `Origin`. The test used a fake credential and no external services.
- Test harness and observed network evidence:
  `/tmp/mindspool-firefox-headers.mjs` and
  `/tmp/mindspool-firefox-headers-final.log` (temporary local artifacts).

No production Clerk session, production save, or installation on the affected
PC was tested. Local app builds use the existing development environment.
Rebuild with the affected installation's production public environment values
before distributing the update.

## Remaining Clerk protection-script warning

Clerk JS 6.37.0's bundled `no-rhc` client still attempts to load the remote
protection scripts returned in its environment configuration. Firefox's MV3
extension policy blocks that remote code. The header fix leaves the script
policy intact and does not change Clerk dashboard protection settings. This
warning is separate from the HTTP 400 token failure; its removal is not claimed
by this fix.

## Applying the update

Run `pnpm --filter @mindspool/extension build:firefox` with the original
installation's environment settings. Copy the complete
`apps/extension/.output/firefox-mv3/` folder to the affected PC, then reload its
temporary add-on in `about:debugging` (or load the folder's `manifest.json`). A
normally installed signed add-on needs an updated signed package. Accept the
new request permissions and ensure the extension has access to its configured
Clerk host. Refresh X/Reddit before trying another clip.
