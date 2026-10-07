import { browser } from "wxt/browser";
import { watchTweets } from "../src/injectButton";
import type { ClipRequest, ClipResponse } from "../src/messages";

export default defineContentScript({
  matches: ["*://x.com/*", "*://twitter.com/*"],
  main() {
    watchTweets(
      document,
      (request: ClipRequest) =>
        browser.runtime.sendMessage(request) as Promise<ClipResponse>,
    );
  },
});
