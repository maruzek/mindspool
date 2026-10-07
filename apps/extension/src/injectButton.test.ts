import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClipButtons, watchTweets } from "./injectButton";
import type { ClipRequest, ClipResponse } from "./messages";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "src/__fixtures__", `${name}.html`), "utf8");
const BUTTON = "[data-mindspool-clip]";
const articles = () => [...document.querySelectorAll("article")];
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(BUTTON)];

type Send = (request: ClipRequest) => Promise<ClipResponse>;
const sendOk: Send = async () => ({ ok: true, itemId: "i1" });

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<main>${fixture("plain")}${fixture("quoted")}</main>`;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("addClipButtons", () => {
  it("adds one button to each tweet's action bar, none for the quoted tweet", () => {
    addClipButtons(document.body, sendOk);
    expect(buttons()).toHaveLength(2);
    for (const article of articles()) {
      const own = article.querySelectorAll(BUTTON);
      expect(own).toHaveLength(1);
      expect(own[0]!.closest('[role="group"]')).not.toBeNull();
    }
    expect(
      document.querySelector(`[data-testid="quoteTweet"] ${BUTTON}`),
    ).toBeNull();
  });
  it("adds nothing more when run again", () => {
    addClipButtons(document.body, sendOk);
    addClipButtons(document.body, sendOk);
    expect(buttons()).toHaveLength(2);
  });
  it("starts idle with the label Clip", () => {
    addClipButtons(document.body, sendOk);
    expect(buttons()[0]!.textContent).toBe("Clip");
  });
});

describe("watchTweets", () => {
  it("buttons tweets that are already there and ones added later", async () => {
    const stop = watchTweets(document, sendOk);
    expect(buttons()).toHaveLength(2);
    document
      .querySelector("main")!
      .insertAdjacentHTML("beforeend", fixture("reply"));
    await Promise.resolve();
    expect(buttons()).toHaveLength(3);
    stop();
  });
  it("puts the button back when the page re-renders the action bar", async () => {
    const stop = watchTweets(document, sendOk);
    buttons()[0]!.remove();
    await Promise.resolve();
    expect(buttons()).toHaveLength(2);
    stop();
  });
  it("stays at one button per tweet through many page changes", async () => {
    const stop = watchTweets(document, sendOk);
    for (let i = 0; i < 5; i++) {
      document.querySelector("main")!.append(document.createElement("div"));
      await Promise.resolve();
    }
    expect(buttons()).toHaveLength(2);
    stop();
  });
  it("stops watching when told to", async () => {
    const stop = watchTweets(document, sendOk);
    stop();
    document
      .querySelector("main")!
      .insertAdjacentHTML("beforeend", fixture("reply"));
    await Promise.resolve();
    expect(buttons()).toHaveLength(2);
  });
});

describe("clicking Clip", () => {
  const click = async (button: HTMLButtonElement) => {
    button.click();
    await vi.advanceTimersByTimeAsync(0);
  };

  it("sends the parsed tweet and shows Clipping… then Clipped", async () => {
    let finish!: (r: ClipResponse) => void;
    const send = vi.fn<Send>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    addClipButtons(document.body, send);
    const button = buttons()[0]!;
    await click(button);
    expect(button.textContent).toBe("Clipping…");
    expect(button.disabled).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      type: "clip",
      args: {
        originalInput: "https://x.com/jane/status/1001",
        captureKey: "x:1001",
        captureSource: "extension",
      },
    });
    finish({ ok: true, itemId: "i1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(button.textContent).toBe("Clipped");
  });
  it("sends once even if clicked again while clipping", async () => {
    const send = vi.fn<Send>(() => new Promise(() => {}));
    addClipButtons(document.body, send);
    const button = buttons()[0]!;
    await click(button);
    await click(button);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("returns to Clip after three seconds", async () => {
    addClipButtons(document.body, sendOk);
    const button = buttons()[0]!;
    await click(button);
    expect(button.textContent).toBe("Clipped");
    await vi.advanceTimersByTimeAsync(2999);
    expect(button.textContent).toBe("Clipped");
    await vi.advanceTimersByTimeAsync(1);
    expect(button.textContent).toBe("Clip");
    expect(button.disabled).toBe(false);
  });
  it.each([
    ["signed_out", "Sign in via the extension popup"],
    ["invalid", "This tweet can't be clipped"],
    ["network", "No connection, try again"],
    ["unknown", "Something went wrong"],
  ] as const)("shows the message for %s", async (reason, message) => {
    addClipButtons(document.body, async () => ({ ok: false, reason }));
    const button = buttons()[0]!;
    await click(button);
    expect(button.textContent).toBe(message);
    await vi.advanceTimersByTimeAsync(3000);
    expect(button.textContent).toBe("Clip");
  });
  it("shows an error when the message cannot be delivered", async () => {
    addClipButtons(document.body, async () => {
      throw new Error("Receiving end does not exist");
    });
    const button = buttons()[0]!;
    await click(button);
    expect(button.textContent).toBe("Something went wrong");
  });
  it("says it could not read an unreadable tweet and sends nothing", async () => {
    document.body.innerHTML = fixture("empty");
    const send = vi.fn<Send>(sendOk);
    addClipButtons(document.body, send);
    const button = buttons()[0]!;
    await click(button);
    expect(button.textContent).toBe("Couldn't read this tweet");
    expect(send).not.toHaveBeenCalled();
  });
  it("does not let the click reach the tweet", async () => {
    const onArticle = vi.fn();
    articles()[0]!.addEventListener("click", onArticle);
    addClipButtons(document.body, sendOk);
    await click(buttons()[0]!);
    expect(onArticle).not.toHaveBeenCalled();
  });
});
