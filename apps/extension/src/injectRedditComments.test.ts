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
const check = (id: string) =>
  document.querySelector<HTMLInputElement>(
    `shreddit-comment[thingid="t1_${id}"] input[data-mindspool-reddit="keep"]`,
  )!;
const clip = (p: Element) =>
  p.shadowRoot!.querySelector<HTMLButtonElement>(
    'button[data-mindspool-reddit="clip"]',
  )!;
beforeEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/comments/abc123/");
});
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});
describe("Keep comment controls", () => {
  it("preserves snapshots and retry through a same-route detail rendering gap", async () => {
    const post = setup();
    const requests: RedditClipRequest[] = [];
    stop = watchReddit(document, async (request) => {
      requests.push(request);
      return { ok: false, reason: "unknown" };
    });
    check("parent1").click();
    clip(post).click();
    await flush();
    post.remove();
    await flush();
    expect(check("parent1").checked).toBe(true);
    document.body.prepend(post);
    await flush();
    expect(post.shadowRoot!.textContent).toContain("1 comments selected");
    document.querySelector('[slot="comment"]')!.textContent =
      "Changed during gap";
    clip(post).click();
    await flush();
    expect(requests[1]!.args).toEqual(requests[0]!.args);
  });
  it.each([true, false])(
    "refreshes replacement detail controls after pending success=%s",
    async (success) => {
      const post = setup();
      let finish!: (response: ClipResponse) => void;
      const send = vi.fn(
        () =>
          new Promise<ClipResponse>((resolve) => {
            finish = resolve;
          }),
      );
      stop = watchReddit(document, send);
      check("parent1").click();
      clip(post).click();
      const next = post.cloneNode(true) as Element;
      next.attachShadow({ mode: "open" }).innerHTML =
        '<div data-testid="action-row"><button>Share</button></div>';
      post.replaceWith(next);
      await flush();
      expect(clip(next).disabled).toBe(true);
      finish(
        success
          ? { ok: true, itemId: "saved" }
          : { ok: false, reason: "unknown" },
      );
      await flush();
      expect(check("parent1").disabled).toBe(false);
      expect(check("parent1").checked).toBe(!success);
      expect(clip(next).disabled).toBe(false);
      expect(clip(next).textContent).toBe(
        success ? "Clipped" : "Something went wrong",
      );
      expect(next.shadowRoot!.textContent).toContain(
        `${success ? 0 : 1} comments selected`,
      );
    },
  );
  it("keeps independent parent/reply snapshots locally and sends removed nodes only on Clip", async () => {
    const post = setup();
    const requests: RedditClipRequest[] = [];
    stop = watchReddit(document, async (r) => {
      requests.push(r);
      return { ok: true, itemId: "saved" };
    });
    expect(check("parent1").checked).toBe(false);
    expect(check("reply1").checked).toBe(false);
    check("reply1").click();
    expect(check("parent1").checked).toBe(false);
    check("parent1").click();
    expect(requests).toHaveLength(0);
    expect(post.shadowRoot!.textContent).toContain("2 comments selected");
    document.querySelector("shreddit-comment")!.remove();
    await flush();
    clip(post).click();
    await flush();
    expect(requests[0]!.args.comments.map((c) => c.id)).toEqual([
      "reply1",
      "parent1",
    ]);
    expect(requests[0]!.args.comments[0]!.text).toBe("Independent reply");
    expect(post.shadowRoot!.textContent).toContain("0 comments selected");
  });
  it("retains a frozen selection after an oversized or ambiguous failure and clears after success", async () => {
    const post = setup();
    const requests: RedditClipRequest[] = [];
    let result: ClipResponse = {
      ok: false,
      reason: "invalid",
      hint: "content_too_large",
    };
    stop = watchReddit(document, async (r) => {
      requests.push(r);
      return result;
    });
    check("parent1").click();
    clip(post).click();
    await flush();
    expect(check("parent1").checked).toBe(true);
    expect(clip(post).textContent).toMatch(/Deselect.*try again/);
    document.querySelector('[slot="comment"]')!.textContent = "Changed later";
    result = { ok: false, reason: "unknown" };
    clip(post).click();
    await flush();
    expect(requests[1]!.args).toEqual(requests[0]!.args);
    expect(check("parent1").checked).toBe(true);
    result = { ok: true, itemId: "saved" };
    clip(post).click();
    await flush();
    expect(check("parent1").checked).toBe(false);
  });
  it("disables selection while pending and ignores late completion after navigation away and back", async () => {
    const post = setup();
    let finish!: (r: ClipResponse) => void;
    stop = watchReddit(
      document,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    check("reply1").click();
    clip(post).click();
    expect(check("reply1").disabled).toBe(true);
    history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flush();
    expect(check("reply1")).toBeNull();
    history.replaceState(null, "", "/comments/abc123/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flush();
    expect(check("reply1").checked).toBe(false);
    check("parent1").click();
    finish({ ok: true, itemId: "old" });
    await flush();
    expect(check("parent1").checked).toBe(true);
    expect(clip(post).textContent).toBe("Clip");
  });
  it("refreshes detail state through the content context navigation hook", async () => {
    const post = setup();
    const watcher = watchReddit(document, async () => ({
      ok: true,
      itemId: "ok",
    }));
    stop = watcher;
    check("parent1").click();
    history.replaceState(null, "", "/");
    watcher.refresh();
    await flush();
    expect(check("parent1")).toBeNull();
    history.replaceState(null, "", "/comments/abc123/");
    watcher.refresh();
    await flush();
    expect(check("parent1").checked).toBe(false);
    expect(post.shadowRoot!.textContent).toContain("0 comments selected");
  });
  it("limits selection to 20 while allowing deselection and adding newly loaded comments", async () => {
    const post = setup();
    const base = document.querySelector("shreddit-comment")!;
    base.querySelector("shreddit-comment")!.remove();
    for (let i = 0; i < 21; i++) {
      const node = base.cloneNode(true) as Element;
      node.setAttribute("thingid", `t1_c${i}`);
      node.setAttribute("permalink", `/comments/abc123/_/c${i}/`);
      document.body.append(node);
    }
    base.remove();
    const send = vi.fn(async (): Promise<ClipResponse> => ({
      ok: true,
      itemId: "ok",
    }));
    stop = watchReddit(document, send);
    for (let i = 0; i < 21; i++) check(`c${i}`).click();
    expect(check("c20").checked).toBe(false);
    expect(post.shadowRoot!.textContent).toMatch(/20.*per save/);
    check("c0").click();
    check("c20").click();
    expect(check("c20").checked).toBe(true);
    expect(send).not.toHaveBeenCalled();
    const fresh = base.cloneNode(true) as Element;
    fresh.setAttribute("thingid", "t1_fresh1");
    fresh.setAttribute("permalink", "/comments/abc123/_/fresh1/");
    document.body.append(fresh);
    await flush();
    expect(check("fresh1").checked).toBe(false);
    stop();
    stop = undefined;
    expect(document.querySelector('[data-mindspool-reddit="keep"]')).toBeNull();
  });
});
