import { buildClip } from "./clip";
import type { ClipFailure, ClipRequest, ClipResponse } from "./messages";
import { isOwnedBy, parseTweet } from "./tweet";

export type Send = (request: ClipRequest) => Promise<ClipResponse>;

const MARK = "data-mindspool-clip";
const RESET_MS = 3000;
// Modernist tokens (see packages/ui globals.css), inline because X's page CSS can't be relied on.
const ACCENT = "#5b2fc9";
const HOVER_BG = "#4e25b0";
const BUTTON_STYLE = [
  'font:800 13px/1 "Archivo",system-ui,sans-serif',
  "color:#fff",
  `background:${ACCENT}`,
  "border:0",
  "border-radius:0",
  "padding:7px 12px",
  "margin-left:8px",
  "cursor:pointer",
  "box-shadow:2px 2px 0 #a78be6",
].join(";");
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
  button.style.cssText = BUTTON_STYLE;
  button.addEventListener("mouseenter", () => {
    button.style.background = HOVER_BG;
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = ACCENT;
  });
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
