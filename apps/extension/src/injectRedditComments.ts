import type { RedditPostInput } from "@mindspool/schema";
import { parseRedditComment } from "./redditComment";
import type { RedditCommentClips } from "./redditCommentClips";
import type { RedditSend } from "./injectRedditButton";
import type { ClipResponse } from "./messages";

const failureText = {
  signed_out: "Sign in via the extension popup",
  invalid: "This comment can't be clipped",
  network: "No connection, try again",
  unknown: "Something went wrong",
};
const mark = "data-mindspool-reddit";
function actionRow(node: Element): Element | undefined {
  return [...node.querySelectorAll('[slot="actionRow"]')].find(
    (row) => row.closest("shreddit-comment") === node,
  );
}

/** Controls own listeners/timers; request snapshots and visit state live outside DOM nodes. */
export function redditCommentControls(
  doc: Document,
  clips: RedditCommentClips,
  resolvePost: () => RedditPostInput | null,
  send: RedditSend,
) {
  const controls = new Map<
    Element,
    {
      button: HTMLButtonElement;
      row: Element;
      abort: AbortController;
      id: string;
      generation: number;
    }
  >();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;
  let generation = clips.generation;
  const remove = (node: Element) => {
    const control = controls.get(node);
    control?.abort.abort();
    control?.button.remove();
    controls.delete(node);
  };
  const paint = () => {
    for (const control of controls.values()) {
      const state = clips.status(control.id);
      if (control.button.textContent !== state.text)
        control.button.textContent = state.text;
      control.button.disabled = state.disabled;
    }
  };
  const sync = () => {
    if (generation !== clips.generation) {
      timers.forEach(clearTimeout);
      timers.clear();
      generation = clips.generation;
    }
    for (const [node, control] of controls) {
      const parsed = clips.postId && parseRedditComment(node, clips.postId);
      if (
        !node.isConnected ||
        !parsed ||
        parsed.id !== control.id ||
        control.generation !== clips.generation ||
        actionRow(node) !== control.row ||
        control.button.parentNode !== control.row
      )
        remove(node);
    }
    if (!clips.postId) return;
    for (const node of doc.querySelectorAll("shreddit-comment")) {
      const parsed = parseRedditComment(node, clips.postId);
      const row = actionRow(node);
      if (!parsed || !row || controls.has(node)) continue;
      // A framework clone can contain our old DOM without its listeners.
      for (const stale of row.querySelectorAll(`[${mark}="comment-clip"]`))
        stale.remove();
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute(mark, "comment-clip");
      button.setAttribute("aria-label", "Clip comment to MindSpool");
      button.setAttribute("aria-live", "polite");
      button.style.cssText =
        "font:800 13px/1 system-ui,sans-serif;color:#fff;background:#5b2fc9;border:0;padding:7px 12px;margin-left:8px;cursor:pointer;position:relative;z-index:5;pointer-events:auto";
      const abort = new AbortController();
      const control = {
        button,
        row,
        abort,
        id: parsed.id,
        generation: clips.generation,
      };
      controls.set(node, control);
      row.append(button);
      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const post = resolvePost();
          const current =
            clips.postId && parseRedditComment(node, clips.postId);
          if (
            stopped ||
            !node.isConnected ||
            controls.get(node) !== control ||
            control.generation !== clips.generation ||
            !current ||
            current.id !== control.id ||
            actionRow(node) !== row ||
            button.parentNode !== row
          )
            return;
          const request = clips.begin(post, current);
          if (!request) return;
          clearTimeout(timers.get(control.id));
          timers.delete(control.id);
          paint();
          let reply: ClipResponse;
          try {
            reply = await send({ type: "clip-reddit", args: request.args });
          } catch {
            reply = { ok: false, reason: "unknown" };
          }
          if (stopped) return;
          resolvePost(); // Reconcile route changes even before the observer's next scan.
          const success =
            reply?.ok === true &&
            typeof reply.itemId === "string" &&
            Boolean(reply.itemId);
          const feedback =
            reply?.ok === false
              ? reply.hint === "content_too_large"
                ? "This capture is too large to save"
                : (failureText[reply.reason] ?? failureText.unknown)
              : failureText.unknown;
          if (!clips.finish(request, success, feedback)) return;
          paint();
          if (!success)
            timers.set(
              control.id,
              setTimeout(() => {
                clips.resetFeedback(control.id, request.generation);
                timers.delete(control.id);
                paint();
              }, 3000),
            );
        },
        { signal: abort.signal },
      );
    }
    paint();
  };
  return {
    sync,
    stop: () => {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.clear();
      for (const node of controls.keys()) remove(node);
    },
  };
}
