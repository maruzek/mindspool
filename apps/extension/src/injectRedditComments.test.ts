import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchReddit } from "./injectRedditButton";
import type { ClipResponse, RedditClipRequest } from "./messages";

const posts = readFileSync("src/__fixtures__/reddit/posts.html", "utf8");
const comments = readFileSync("src/__fixtures__/reddit/comments.html", "utf8");
let stop: (() => void) | undefined;
function setup() {
  const host = document.createElement("div");
  host.innerHTML = posts;
  const post = host.querySelector('[data-case="detail"] shreddit-post')!;
  const template = post.querySelector("template")!;
  post.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
  template.remove();
  document.body.append(post);
  document.body.insertAdjacentHTML("beforeend", comments);
  return post;
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>(
    `shreddit-comment[thingid="t1_${id}"] button[data-mindspool-reddit="comment-clip"]`,
  )!;
const clip = (p: Element) =>
  p.shadowRoot!.querySelector<HTMLButtonElement>(
    'button[data-mindspool-reddit="clip"]',
  )!;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/comments/abc123/");
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});
describe("immediate comment Clip controls", () => {
  it("places Clip alongside native actions and preserves pending state when their component is replaced", async () => {
    setup();
    const comment = document.querySelector("shreddit-comment")!;
    const wrapper = comment.querySelector('[slot="actionRow"]')!;
    const makeRow = () => {
      const row = document.createElement("shreddit-comment-action-row");
      row.slot = "actionRow";
      row.innerHTML =
        '<button slot="comment-reply">Reply</button><button slot="comment-share">Share</button>';
      row.attachShadow({ mode: "open" }).innerHTML =
        '<div style="display:flex;align-items:center"><button>Upvote</button><button>Downvote</button><slot name="comment-reply"></slot><slot name="comment-share"></slot><slot name="overflow"></slot></div>';
      return row;
    };
    const native = makeRow();
    wrapper.replaceChildren(native);
    let finish!: (response: ClipResponse) => void;
    const send = vi.fn(
      () =>
        new Promise<ClipResponse>((resolve) => {
          finish = resolve;
        }),
    );
    stop = watchReddit(document, send);
    expect(button("parent1").parentElement).toBe(native);
    expect(button("parent1").slot).toBe("comment-share");
    expect(button("parent1").assignedSlot).toBe(
      native.shadowRoot!.querySelector('slot[name="comment-share"]'),
    );
    expect(
      native.querySelector('button[slot="comment-share"]')!.textContent,
    ).toBe("Share");
    button("parent1").click();
    const next = makeRow();
    native.replaceWith(next);
    await flush();
    expect(button("parent1").parentElement).toBe(next);
    expect(button("parent1").disabled).toBe(true);
    button("parent1").click();
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true, itemId: "saved" });
    await flush();
    expect(button("parent1").textContent).toBe("Clipped");
    expect(button("parent1").disabled).toBe(true);
  });
  it("sends only the activated comment with independent parent/reply/post requests", async () => {
    const post = setup();
    const finishes: Array<(r: ClipResponse) => void> = [];
    const requests: RedditClipRequest[] = [];
    const native = vi.fn();
    document.body.addEventListener("click", native, { once: true });
    stop = watchReddit(document, (r) => {
      requests.push(r);
      return new Promise((resolve) => finishes.push(resolve));
    });
    expect(button("parent1").getAttribute("aria-label")).toBe(
      "Clip comment to MindSpool",
    );
    expect(button("parent1").type).toBe("button");
    button("parent1").focus();
    expect(button("parent1").style.outline).toContain("solid");
    expect(button("parent1").style.getPropertyPriority("outline")).toBe(
      "important",
    );
    button("parent1").blur();
    expect(button("parent1").style.outline).toBe("");
    button("parent1").click();
    button("parent1").click();
    expect(button("parent1").disabled).toBe(true);
    expect(button("reply1").disabled).toBe(false);
    button("reply1").click();
    clip(post).click();
    expect(native).not.toHaveBeenCalled();
    expect(requests.map((r) => r.args.comments.map((c) => c.id))).toEqual([
      ["parent1"],
      ["reply1"],
      [],
    ]);
    expect(requests[0]!.args.comments[0]!.text).toBe(
      "Parent paragraph 😀\n\nSecond line\n\nFirst\nSecond link text",
    );
    expect(requests[1]!.args.comments[0]!.text).toBe("Independent reply");
    finishes.forEach((f) =>
      f({ ok: true, itemId: "saved", addedCommentCount: 0 }),
    );
    await flush();
    expect(button("parent1").textContent).toBe("Clipped");
    await vi.advanceTimersByTimeAsync(3000);
    expect(button("parent1").disabled).toBe(true);
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(post.shadowRoot!.textContent).not.toMatch(/selected|Maximum 20/);
  });
  it.each([
    [{ ok: false, reason: "unknown" }, "Something went wrong"],
    [{ ok: false, reason: "signed_out" }, "Sign in via the extension popup"],
    [{ ok: false, reason: "network" }, "No connection, try again"],
    [
      { ok: false, reason: "invalid", hint: "content_too_large" },
      "This capture is too large to save",
    ],
  ] as const)(
    "keeps an immutable retry through feedback reset, action-row replacement and a detail gap: %s",
    async (result, text) => {
      const post = setup();
      const requests: RedditClipRequest[] = [];
      stop = watchReddit(document, async (r) => {
        requests.push(r);
        return result;
      });
      button("parent1").click();
      await flush();
      expect(button("parent1").textContent).toBe(text);
      await vi.advanceTimersByTimeAsync(3000);
      expect(button("parent1").textContent).toBe("Clip");
      const node = document.querySelector("shreddit-comment")!;
      const oldRow = node.querySelector('[slot="actionRow"]')!;
      const row = oldRow.cloneNode(false) as Element;
      oldRow.replaceWith(row);
      await flush();
      expect(row.querySelectorAll("[data-mindspool-reddit]")).toHaveLength(1);
      node.querySelector('[slot="comment"]')!.textContent = "Edited later";
      post.remove();
      await flush();
      button("parent1").click();
      await flush();
      expect(requests).toHaveLength(2);
      expect(requests[1]!.args).toEqual(requests[0]!.args);
    },
  );
  it.each([true, false])(
    "preserves pending state across comment replacement (success=%s)",
    async (success) => {
      setup();
      let finish!: (r: ClipResponse) => void;
      stop = watchReddit(
        document,
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      button("parent1").click();
      const node = document.querySelector("shreddit-comment")!;
      const next = node.cloneNode(true) as Element;
      node.replaceWith(next);
      await flush();
      expect(button("parent1").disabled).toBe(true);
      expect(
        next.querySelectorAll('[data-mindspool-reddit="comment-clip"]'),
      ).toHaveLength(2);
      finish(
        success
          ? { ok: true, itemId: "saved" }
          : { ok: false, reason: "unknown" },
      );
      await flush();
      expect(button("parent1").disabled).toBe(success);
      expect(button("parent1").textContent).toBe(
        success ? "Clipped" : "Something went wrong",
      );
    },
  );
  it("rejects recycled identities on activation and stale completions after navigation away/back", async () => {
    setup();
    let finish!: (r: ClipResponse) => void;
    const send = vi.fn(
      () =>
        new Promise<ClipResponse>((resolve) => {
          finish = resolve;
        }),
    );
    const watcher = watchReddit(document, send);
    stop = watcher;
    const node = document.querySelector("shreddit-comment")!;
    node.setAttribute("thingid", "t1_other1");
    button("reply1").click();
    const old = node.querySelector<HTMLButtonElement>(
      '[data-mindspool-reddit="comment-clip"]',
    )!;
    old.click();
    expect(send).toHaveBeenCalledTimes(1);
    history.replaceState(null, "", "/");
    watcher.refresh();
    await flush();
    expect(button("reply1")).toBeNull();
    history.replaceState(null, "", "/comments/abc123/");
    watcher.refresh();
    await flush();
    finish({ ok: true, itemId: "old" });
    await flush();
    expect(button("reply1").textContent).toBe("Clip");
    expect(button("reply1").disabled).toBe(false);
  });
  it("adds newly loaded comments and releases feedback timers/listeners on cleanup", async () => {
    setup();
    stop = watchReddit(document, async () => ({
      ok: false,
      reason: "network",
    }));
    const base = document.querySelector("shreddit-comment")!;
    const fresh = base.cloneNode(true) as Element;
    fresh.querySelector("shreddit-comment")!.remove();
    fresh.setAttribute("thingid", "t1_fresh1");
    fresh.setAttribute("permalink", "/comments/abc123/_/fresh1/");
    document.body.append(fresh);
    await flush();
    expect(button("fresh1")).toBeTruthy();
    button("fresh1").click();
    await flush();
    const detached = button("fresh1");
    stop();
    stop = undefined;
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      document.querySelector('[data-mindspool-reddit="comment-clip"]'),
    ).toBeNull();
    detached.click();
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
