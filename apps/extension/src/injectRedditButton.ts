import { parseRedditPost } from "./reddit";
import { buildRedditClip } from "./redditClip";
import type { ClipResponse, RedditClipRequest } from "./messages";
import { redditIdentityFromUrl } from "@mindspool/schema";
import { RedditSelection } from "./redditSelection";
import { redditCommentControls } from "./injectRedditComments";

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
  count: HTMLElement;
};
type PostState = {
  identity: string;
  postId: string;
  detail: boolean;
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
export function watchReddit(
  doc: Document,
  send: RedditSend,
): (() => void) & { refresh: () => void } {
  const states = new Map<Element, PostState>();
  const roots = new Map<ShadowRoot, MutationObserver>();
  const selection = new RedditSelection();
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
      const isDetail = state.detail && state.postId === selection.postId;
      state.control.count.hidden = !isDetail;
      const countText = `${selection.count} comments selected · Maximum 20 comments per save`;
      if (state.control.count.textContent !== countText)
        state.control.count.textContent = countText;
    }
  };
  const comments = redditCommentControls(doc, selection, () => {
    states.forEach(paint);
  });
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
    const count = doc.createElement("span");
    count.setAttribute("aria-live", "polite");
    count.style.cssText = "font:12px system-ui,sans-serif;margin-left:8px";
    state.control = { wrapper, button, abort, count };
    wrapper.append(button, count);
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
        const isDetail =
          post.getAttribute("view-context") === "CommentsPage" &&
          selection.postId === parsed.id;
        const request = isDetail ? selection.begin(parsed) : null;
        if (isDetail && !request) return;
        state.busy = true;
        state.text = "Clipping…";
        clearTimeout(state.timer);
        paint(state);
        comments.paint();
        let reply: ClipResponse;
        try {
          reply = await send({
            type: "clip-reddit",
            args: request?.args ?? buildRedditClip(parsed),
          });
        } catch {
          reply = { ok: false, reason: "unknown" };
        }
        const success =
          reply?.ok === true &&
          typeof reply.itemId === "string" &&
          Boolean(reply.itemId);
        const accepted = request ? selection.finish(request, success) : true;
        if (stopped || !accepted) return;
        const feedback = success
          ? "Clipped"
          : reply?.ok === false
            ? reply.hint === "content_too_large"
              ? "Deselect comments and try again"
              : (failureText[reply.reason] ?? failureText.unknown)
            : failureText.unknown;
        if (request) {
          comments.paint();
          for (const [node, active] of states)
            if (
              active.detail &&
              active.postId === request.args.post.id &&
              current(node, active)
            ) {
              active.busy = false;
              flash(active, feedback);
            }
          states.forEach(paint);
        } else if (current(post, state)) {
          state.busy = false;
          flash(state, feedback);
        }
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
        "thingid",
        "postid",
        "post-id",
        "hidden",
        "aria-hidden",
        "open",
        "blurred",
        "class",
        "style",
      ],
    });
    return observer;
  };
  const scan = () => {
    const route = redditIdentityFromUrl(
      doc.defaultView?.location.pathname ?? "",
    );
    const detail = [
      ...doc.querySelectorAll('shreddit-post[view-context="CommentsPage"]'),
    ].find((post) => parseRedditPost(post)?.id === route?.postId);
    const generation = selection.generation;
    const closed = [...states].some(
      ([post, state]) =>
        state.detail &&
        post.isConnected &&
        post.getAttribute("view-context") !== "CommentsPage",
    );
    selection.navigate(
      !closed && route && (detail || route.postId === selection.postId)
        ? route.postId
        : null,
    );
    if (selection.generation !== generation)
      for (const [post, state] of states)
        if (post.getAttribute("view-context") === "CommentsPage")
          removeState(post, state);
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
      const parsed = parseRedditPost(post);
      if (!parent || !parsed) continue;
      let state = states.get(post);
      if (!state) {
        const isDetail =
          post.getAttribute("view-context") === "CommentsPage" &&
          parsed.id === selection.postId;
        const busy = isDetail && selection.isBusy;
        state = {
          identity: identity(post),
          postId: parsed.id,
          detail: post.getAttribute("view-context") === "CommentsPage",
          busy,
          text: busy ? "Clipping…" : "Clip",
        };
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
    comments.sync();
    states.forEach(paint);
  };
  const observer = observe(doc.body);
  scan();
  const routeEvents = ["popstate", "hashchange"];
  routeEvents.forEach((event) =>
    doc.defaultView?.addEventListener(event, schedule),
  );
  void doc.defaultView?.customElements
    .whenDefined("shreddit-post")
    .then(schedule);
  const stop = () => {
    stopped = true;
    observer.disconnect();
    roots.forEach((observer) => observer.disconnect());
    roots.clear();
    routeEvents.forEach((event) =>
      doc.defaultView?.removeEventListener(event, schedule),
    );
    comments.stop();
    selection.navigate(null);
    for (const [post, state] of states) removeState(post, state);
  };
  return Object.assign(stop, { refresh: schedule });
}
