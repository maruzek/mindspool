import { parseRedditPost } from "./reddit";
import { buildRedditClip } from "./redditClip";
import type { ClipResponse, RedditClipRequest } from "./messages";

export type RedditSend = (request: RedditClipRequest) => Promise<ClipResponse>;
const MARK = "data-mindspool-reddit";
const failureText = {
  signed_out: "Sign in via the extension popup",
  invalid: "This post can't be clipped",
  network: "No connection, try again",
  unknown: "Something went wrong",
};
type Control = {
  wrapper: HTMLElement;
  button: HTMLButtonElement;
  abort: AbortController;
};
type PostState = {
  identity: string;
  busy: boolean;
  text: string;
  control?: Control;
  timer?: ReturnType<typeof setTimeout>;
};

function identity(post: Element): string {
  return [
    post.getAttribute("id"),
    post.getAttribute("permalink"),
    post.getAttribute("view-context"),
  ].join("|");
}
function target(post: Element): Element | null {
  return (
    post.shadowRoot?.querySelector('[data-testid="action-row"]') ??
    [...post.querySelectorAll('[slot="desktop-cta-row"]')].find(
      (node) => node.closest("shreddit-post") === post,
    ) ??
    null
  );
}

/** Watches public rendered posts and their accessible roots; owns every listener and timer. */
export function watchReddit(doc: Document, send: RedditSend): () => void {
  const states = new Map<Element, PostState>();
  const roots = new Map<ShadowRoot, MutationObserver>();
  let stopped = false;
  let scheduled = false;
  const removeControl = (state: PostState) => {
    state.control?.abort.abort();
    state.control?.wrapper.remove();
    state.control = undefined;
  };
  const removeState = (post: Element, state: PostState) => {
    clearTimeout(state.timer);
    removeControl(state);
    states.delete(post);
  };
  const paint = (state: PostState) => {
    if (state.control) {
      state.control.button.textContent = state.text;
      state.control.button.disabled = state.busy;
    }
  };
  const flash = (state: PostState, text: string) => {
    clearTimeout(state.timer);
    state.text = text;
    paint(state);
    state.timer = setTimeout(() => {
      state.text = "Clip";
      paint(state);
      state.timer = undefined;
    }, 3000);
  };
  const current = (post: Element, state: PostState) =>
    !stopped &&
    post.isConnected &&
    states.get(post) === state &&
    identity(post) === state.identity;
  const makeControl = (post: Element, state: PostState, parent: Element) => {
    const wrapper = doc.createElement("span");
    wrapper.setAttribute(MARK, "controls");
    const button = doc.createElement("button");
    button.type = "button";
    button.setAttribute(MARK, "clip");
    button.setAttribute("aria-label", "Clip post to MindSpool");
    button.setAttribute("aria-live", "polite");
    button.style.cssText =
      "font:800 13px/1 system-ui,sans-serif;color:#fff;background:#5b2fc9;border:0;padding:7px 12px;margin-left:8px;cursor:pointer;position:relative;z-index:5;pointer-events:auto";
    const abort = new AbortController();
    state.control = { wrapper, button, abort };
    wrapper.append(button);
    parent.append(wrapper);
    paint(state);
    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!current(post, state) || state.busy) return;
        const parsed = parseRedditPost(post);
        if (!parsed) return flash(state, "Couldn't read this post");
        state.busy = true;
        state.text = "Clipping…";
        clearTimeout(state.timer);
        paint(state);
        let reply: ClipResponse;
        try {
          reply = await send({
            type: "clip-reddit",
            args: buildRedditClip(parsed),
          });
        } catch {
          reply = { ok: false, reason: "unknown" };
        }
        if (!current(post, state)) return;
        state.busy = false;
        flash(
          state,
          reply?.ok === true && typeof reply.itemId === "string" && reply.itemId
            ? "Clipped"
            : reply?.ok === false
              ? (failureText[reply.reason] ?? failureText.unknown)
              : failureText.unknown,
        );
      },
      { signal: abort.signal },
    );
  };
  const schedule = () => {
    if (stopped || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!stopped) scan();
    });
  };
  const observe = (root: Node) => {
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(
              record.target instanceof Element &&
              record.target.closest(`[${MARK}]`)
            ) &&
            (record.type === "attributes" ||
              record.removedNodes.length > 0 ||
              [...record.addedNodes].some(
                (node) => !(node instanceof Element && node.hasAttribute(MARK)),
              )),
        )
      )
        schedule();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "id",
        "permalink",
        "post-title",
        "view-context",
        "view-type",
      ],
    });
    return observer;
  };
  const scan = () => {
    for (const [post, state] of states)
      if (!post.isConnected || identity(post) !== state.identity)
        removeState(post, state);
    for (const [root, observer] of roots)
      if (!root.host.isConnected) {
        observer.disconnect();
        roots.delete(root);
      }
    for (const post of doc.querySelectorAll("shreddit-post")) {
      if (post.parentElement?.closest("shreddit-post")) continue;
      if (post.shadowRoot && !roots.has(post.shadowRoot))
        roots.set(post.shadowRoot, observe(post.shadowRoot));
      const parent = target(post);
      if (!parent || !parseRedditPost(post)) continue;
      let state = states.get(post);
      if (!state) {
        state = { identity: identity(post), busy: false, text: "Clip" };
        states.set(post, state);
      }
      if (
        state.control?.wrapper.parentNode === parent &&
        state.control.wrapper.isConnected
      )
        continue;
      removeControl(state);
      makeControl(post, state, parent);
    }
  };
  const observer = observe(doc.body);
  scan();
  void doc.defaultView?.customElements
    .whenDefined("shreddit-post")
    .then(schedule);
  return () => {
    stopped = true;
    observer.disconnect();
    roots.forEach((observer) => observer.disconnect());
    roots.clear();
    for (const [post, state] of states) removeState(post, state);
  };
}
