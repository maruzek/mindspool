import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchReddit } from "./injectRedditButton";
import type { RedditClipRequest, ClipResponse } from "./messages";

const fixture = readFileSync("src/__fixtures__/reddit/posts.html", "utf8");
const mark = 'button[data-mindspool-reddit="clip"]';
function load(name = "card-text") {
  const host = document.createElement("div");
  host.innerHTML = fixture;
  const post = host.querySelector(`[data-case="${name}"] shreddit-post`)!;
  const template = post.querySelector<HTMLTemplateElement>(
    'template[shadowrootmode="open"]',
  );
  if (template) {
    post
      .attachShadow({ mode: "open" })
      .append(template.content.cloneNode(true));
    template.remove();
  }
  document.body.append(post);
  return post;
}
function button(post: Element): HTMLButtonElement {
  return (post.shadowRoot?.querySelector(mark) ??
    post.querySelector(mark)) as HTMLButtonElement;
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  document.body.innerHTML = "";
});
const ok = async (): Promise<ClipResponse> => ({ ok: true, itemId: "item1" });

describe("Reddit Clip controls", () => {
  it("adds one native accessible button in card, compact and detail controls", async () => {
    const posts = [load(), load("compact"), load("detail")];
    stop = watchReddit(document, ok);
    await flush();
    for (const post of posts) {
      const b = button(post);
      expect(b).toBeTruthy();
      expect(b.type).toBe("button");
      expect(b.getAttribute("aria-label")).toBe("Clip post to MindSpool");
      expect(b.textContent).toBe("Clip");
      expect(b.disabled).toBe(false);
    }
    document.body.append(document.createElement("div"));
    await flush();
    for (const post of posts)
      expect(
        post.querySelectorAll(mark).length +
          (post.shadowRoot?.querySelectorAll(mark).length ?? 0),
      ).toBe(1);
  });
  it("reads current content and sends one dedicated request without activating the post", async () => {
    const p = load();
    const requests: RedditClipRequest[] = [];
    const parentClick = vi.fn();
    p.addEventListener("click", parentClick);
    stop = watchReddit(document, async (request) => {
      requests.push(request);
      return ok();
    });
    button(p).click();
    await flush();
    expect(parentClick).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      type: "clip-reddit",
      args: {
        post: { id: "abc123", title: "A useful post", author: "u/reader" },
        comments: [],
      },
    });
    expect(button(p).textContent).toBe("Clipped");
    await vi.advanceTimersByTimeAsync(3000);
    expect(button(p).textContent).toBe("Clip");
  });
  it("suppresses repeated clicks and retains busy state through control replacement", async () => {
    const p = load();
    let finish!: (response: ClipResponse) => void;
    const send = vi.fn(
      () =>
        new Promise<ClipResponse>((resolve) => {
          finish = resolve;
        }),
    );
    stop = watchReddit(document, send);
    button(p).click();
    button(p).click();
    expect(send).toHaveBeenCalledTimes(1);
    const row = p.shadowRoot!.querySelector('[data-testid="action-row"]')!;
    row.replaceChildren();
    await flush();
    expect(button(p).disabled).toBe(true);
    button(p).click();
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true, itemId: "item1" });
    await flush();
    expect(button(p).textContent).toBe("Clipped");
    expect(button(p).disabled).toBe(false);
  });
  it.each([
    ["signed_out", "Sign in via the extension popup"],
    ["invalid", "This post can't be clipped"],
    ["network", "No connection, try again"],
    ["unknown", "Something went wrong"],
  ] as const)("shows %s feedback and allows retry", async (reason, text) => {
    const p = load();
    const send = vi.fn(async (): Promise<ClipResponse> => ({
      ok: false,
      reason,
    }));
    stop = watchReddit(document, send);
    button(p).click();
    await flush();
    expect(button(p).textContent).toBe(text);
    expect(button(p).disabled).toBe(false);
    button(p).click();
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("rejects unreadable current identity without sending", async () => {
    const p = load();
    const send = vi.fn(ok);
    stop = watchReddit(document, send);
    p.setAttribute("id", "t3_other1");
    button(p).click();
    await flush();
    expect(send).not.toHaveBeenCalled();
  });
  it("adds newly rendered cards and releases controls, timers, and observers on cleanup", async () => {
    const first = load();
    stop = watchReddit(document, ok);
    const next = load("gallery");
    await flush();
    expect(button(next)).toBeTruthy();
    button(first).click();
    await flush();
    stop();
    stop = undefined;
    expect(button(first)).toBeNull();
    expect(button(next)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    const after = load("video");
    await flush();
    expect(button(after)).toBeNull();
  });
  it("does not let a late response update a recycled post's new controls", async () => {
    const p = load();
    let finish!: (response: ClipResponse) => void;
    stop = watchReddit(
      document,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button(p).click();
    p.setAttribute("id", "t3_other1");
    p.setAttribute("permalink", "/r/example/comments/other1/new/");
    p.setAttribute("post-title", "New post");
    await flush();
    expect(button(p).textContent).toBe("Clip");
    finish({ ok: true, itemId: "old-item" });
    await flush();
    expect(button(p).textContent).toBe("Clip");
  });
});
