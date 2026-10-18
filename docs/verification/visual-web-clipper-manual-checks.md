# Remaining visual clipper browser checks

Run A–H in **Chrome and Firefox** using the already-loaded built MindSpool
extension. These are the remaining parts of Task 18; basic saving and board
inspection have already passed. Report the browser, letter and first failing
step/message. No request headers are needed.

## Prepare the fixture

Stop the old fixture terminal with Ctrl+C and restart it with the updated script:

```sh
node scripts/probe-visual-clipper.mjs --fixture-only --port=36668
```

Leave the web app and fixture terminals running. Sign in at
http://localhost:5173. No extension rebuild or backend deployment is needed.

Use these exact hosts: `localhost` and `127.0.0.1` intentionally create different
origins for the permission test. The normal page is
http://127.0.0.1:36668/.

## A — Zoom, region cancellation and keyboard

1. On the normal fixture, scroll halfway down and save the visible area. Inspect
   the saved image: it should match that section, not the top of the page.
2. Use the browser menu’s page zoom to test **80%**, **125%**, and **200%**.
   At each setting, select a rectangle around a distinct part of the fixture.
   Check the whole selected rectangle is saved, with no shifted crop or overlay.
   Return to 100% afterward. Page zoom changes the effective pixel ratio; 200%
   supplies an additional higher-ratio run, not proof of a particular physical
   monitor. [MDN explains the relationship](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).
3. Start **Select an area**, then press Escape without drawing. Repeat with a
   click that has no drag. Both should cancel, remove the overlay and save nothing.
4. In the popup, use Tab/Shift+Tab: visible capture, region and full-page controls
   should follow the visual order with visible focus. Activate a control with
   Enter. In the image viewer, test zoom controls, scrolling, Escape to close,
   and focus returning to the control that opened it.

## B — Close the popup during capture

Start full-page capture on the normal fixture and immediately click the same
webpage to close the popup. Keep that tab selected. Wait for capture to finish,
then reopen the popup. It should say Saved and the library should have one new
complete image. The source page must return to its original scroll position,
with no lingering hidden header or overlay. A second intentional capture should
create a separate item.

## C — Failed upload, then retry once

Block only the upload host, rather than disconnecting everything. That leaves
Clerk sign-in and the Convex session API available so an encoded retry can exist.

1. Open a dedicated retry page:
   - Chrome: http://127.0.0.1:36668/?case=retry&browser=chrome
   - Firefox: http://127.0.0.1:36668/?case=retry&browser=firefox
2. Open the extension’s background debugger:
   - **Chrome:** `chrome://extensions` → MindSpool → **service worker** under
     Inspect views. In DevTools, open **Request conditions** from More tools
     (older versions call it Request blocking). Enable blocking and add
     `https://graceful-stork-346.eu-west-1.convex.site/*`.
   - **Firefox:** `about:debugging#/runtime/this-firefox` → MindSpool → **Inspect**.
     Open Network → Request Blocking. In **Block resource when URL contains**,
     add `graceful-stork-346.eu-west-1.convex.site` and enable it.
3. Keep the debugger open. Return to the retry page and capture its visible area.
   Wait for a failed save with **Retry save**. If it saves instead, blocking did
   not take effect; check that the upload request is actually marked blocked.
4. Turn that blocking rule off. Reopen the popup and choose **Retry save** once.
   It should finish and create exactly one item for this operation. Search the
   library for “MindSpool retry fixture” to distinguish it from older captures.
5. Remove the temporary blocking rule after the check.

The controls above follow the official [Chrome debugger](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug),
[Chrome request conditions](https://developer.chrome.com/docs/devtools/request-conditions),
and [Firefox Network Monitor](https://firefox-source-docs.mozilla.org/devtools-user/network_monitor/request_list/#blocking-specific-urls)
instructions. A failure here simulates an unreachable upload endpoint; it does
not claim every whole-device offline/sign-in condition was tested.

## D — Restart the background with a cached retry

1. Repeat C through the point where **Retry save** is visible. Turn blocking off
   and leave this second failed operation unretried.
2. Scroll the source page to a visibly different section so a recapture would
   be obvious. Reload the extension **without removing/uninstalling it**:
   - Chrome: use MindSpool’s reload button on `chrome://extensions`.
   - Firefox: use **Reload** beside MindSpool in `about:debugging`.
3. Return to the source tab and reopen the popup. A pending operation should offer
   retry/interruption status; an already-committed operation may say Saved.
   Choose **Retry save** if offered.
4. Check that exactly one item was saved for this operation and its image is
   the original pre-restart viewport, not the new scrolled section. No page
   overlay or hidden header may remain.

Reloading exercises background initialization while preserving the extension’s
identity. See [Firefox’s reload instructions](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/#reloading-a-temporary-extension).
Removing a temporary add-on or restarting Firefox can have different storage
behavior, so those are not substitutes for this check.

## E — Denied image permission and unavailable download

1. Open **http://localhost:36668/?case=permission**. Right-click the purple image
   and choose **Save image to MindSpool**. Reopen the popup. This image is
   deliberately cross-origin and not canvas-readable, so an ungranted origin
   should show **Allow image download**.
2. Click that button and deny the browser’s permission request. No image should
   save. The popup should explain the failure and allow a screenshot alternative.
3. Click **Allow image download** again, grant it, and check the selected purple
   image saves at its natural size. This also checks recovery after denial.
4. Open **http://localhost:36668/?case=unavailable**. The purple box is deliberately
   a broken image: its source returns 404. Right-click that box and use the native
   save action. Expect an unavailable-image error and no new saved item. Selecting
   an area around the visible box should still work.
5. If an origin was already granted and step 1 skips the permission prompt, that
   does not count as a denial test. In the extension background console only,
   remove this local test permission, then repeat steps 1–3:

   Chrome:

   ```js
   await chrome.permissions.remove({ origins: ["http://127.0.0.1:36668/*"] });
   ```

   Firefox:

   ```js
   await browser.permissions.remove({ origins: ["http://127.0.0.1:36668/*"] });
   ```

   These commands remove only the fixture-image origin permission.

For per-site parity, also save an X attachment and an image on
`www.inspora.design` in whichever browser has not tested that site yet. Confirm
that the saved image is the selected image, with appropriate source context.

## F — Unsupported, oversized and growing pages

At 100% zoom:

- Open `chrome://version` in Chrome or `about:support` in Firefox. The popup
  should explain that this page cannot be captured, with capture actions disabled.
- Open **http://127.0.0.1:36668/?case=oversized** and choose full-page capture.
  Expect a size-limit failure, no saved item and no stranded page modifications.
- Open **http://127.0.0.1:36668/?case=growing** and choose full-page capture.
  This page grows as capture scrolls. It must stop with a clear failure within
  the bounded operation, without saving a partial page, and restore scroll/header.

The current size error may mention the 2 MiB cap even when the pixel/height limit
was reached. A clear failure is expected; record confusing wording separately.

At the end, sign out through the web app, reopen the popup and confirm capture
controls are unavailable with a sign-in action. Sign back in afterward.

## G — Stored image survives source loss; deletion cleans it up

1. Pick one of the **earlier purple-image fixture captures** already in the
   library. Keep the web-app terminal running.
2. Stop only the fixture server with Ctrl+C. Reload the web app and reopen that
   saved reference. Its stored image and 100% inspection should still work.
3. Delete that test reference from the library. It should disappear from the
   library/board and stay gone after refresh. Tell me which browser you used.
   I recorded the earlier fixture storage IDs and will verify the backend file
   was deleted; you do not need Convex dashboard access.
4. Restart the fixture command if continuing tests in the other browser.

## H — Remaining viewer layout edges

On a label board, compare a tall screenshot and a wide image in free cards and
in a column. Resize them independently. Whole visuals should remain visible;
100% inspection should scroll, and Escape should close it without moving or
removing the cards. Use only test references when checking deletion.

## Report

For example:

```text
Chrome: A–H pass
Firefox: A–H pass
```

Or report the first failure by letter, action and exact visible message. State
if a step could not be run; it remains open rather than being counted as passed.
