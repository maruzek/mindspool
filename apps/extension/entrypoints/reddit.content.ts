import { browser } from "wxt/browser";
import { watchReddit } from "../src/injectRedditButton";
import type { ClipResponse } from "../src/messages";

export default defineContentScript({
  matches: ["*://reddit.com/*", "*://www.reddit.com/*"],
  main(ctx) {
    const stop = watchReddit(
      document,
      (request) =>
        browser.runtime.sendMessage(request) as Promise<ClipResponse>,
    );
    ctx.onInvalidated(stop);
    ctx.addEventListener(window, "wxt:locationchange", stop.refresh);
  },
});
