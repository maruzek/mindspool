import { buildClip } from "./clip";
import type { ClipFailure, ClipRequest, ClipResponse } from "./messages";
import { isOwnedBy, parseTweet } from "./tweet";

export type Send = (request: ClipRequest) => Promise<ClipResponse>;

const MARK = "data-mindspool-clip";
const RESET_MS = 3000;
const FAILURE_TEXT: Record<ClipFailure, string> = {
  signed_out: "Sign in via the extension popup",
  invalid: "This tweet can't be clipped",
  network: "No connection, try again",
  unknown: "Something went wrong",
};

function makeButton(article: Element, send: Send): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(MARK, "");
  button.title = "Clip to MindSpool";
  button.setAttribute("aria-live", "polite");
  button.style.cssText =
    "font:inherit;font-size:13px;color:inherit;background:none;border:0;padding:0 8px;cursor:pointer;";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  const flash = (text: string) => {
    button.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.textContent = "Clip";
    }, RESET_MS);
  };
  button.textContent = "Clip";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const tweet = parseTweet(article);
    if (!tweet) return flash("Couldn't read this tweet");
    busy = true;
    button.disabled = true;
    clearTimeout(timer);
    button.textContent = "Clipping…";
    let reply: ClipResponse;
    try {
      reply = await send({ type: "clip", args: buildClip(tweet) });
    } catch {
      reply = { ok: false, reason: "unknown" };
    }
    busy = false;
    button.disabled = false;
    flash(reply.ok ? "Clipped" : FAILURE_TEXT[reply.reason]);
  });
  return button;
}

/** Adds a Clip button to the action bar of every tweet under `root` that lacks one. */
export function addClipButtons(root: ParentNode, send: Send): void {
  for (const article of root.querySelectorAll('article[data-testid="tweet"]')) {
    const bars = Array.from(article.querySelectorAll('[role="group"]')).filter(
      (el) => isOwnedBy(article, el),
    );
    const bar = bars.at(-1);
    if (!bar || bar.querySelector(`[${MARK}]`)) continue;
    bar.append(makeButton(article, send));
  }
}

/** Buttons the tweets now on the page and any that X adds later; returns a stop function. */
export function watchTweets(doc: Document, send: Send): () => void {
  addClipButtons(doc.body, send);
  const observer = new MutationObserver(() => addClipButtons(doc.body, send));
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
