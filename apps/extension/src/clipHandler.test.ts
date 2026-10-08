import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { buildClip } from "./clip";
import { createClipHandler } from "./clipHandler";
import type { ClipResponse } from "./messages";
import { isClipRequest } from "./messages";
import type { ClipRedditArgs } from "./redditClip";

const args = buildClip({
  id: "1",
  url: "https://x.com/jane/status/1",
  author: "Jane",
  handle: "jane",
  text: "hello",
  images: [],
});

describe("Reddit transport", () => {
  const redditArgs: ClipRedditArgs = {
    post: { id: "abc123", title: "Post", text: "Body", images: [] },
    comments: [{ id: "reply1", postId: "abc123", text: "Kept reply" }],
  };
  function client(
    outcome = async () => ({ itemId: "reddit-item", addedCommentCount: 1 }),
  ) {
    const redditSent: ClipRedditArgs[] = [];
    const xSent: unknown[] = [];
    const tokens: string[] = [];
    return {
      redditSent,
      xSent,
      tokens,
      client: {
        setAuth: (token: string) => {
          tokens.push(token);
        },
        createItem: async (a: typeof args) => {
          xSent.push(a);
          return "x-item";
        },
        clipReddit: async (a: ClipRedditArgs) => {
          redditSent.push(a);
          return outcome();
        },
      },
    };
  }
  it("dispatches Reddit through its mutation using the current token and preserves X dispatch", async () => {
    const fake = client();
    const handle = createClipHandler({
      getToken: async () => "current-token",
      client: fake.client,
    });
    expect(await handle({ type: "clip-reddit", args: redditArgs })).toEqual({
      ok: true,
      itemId: "reddit-item",
      addedCommentCount: 1,
    });
    expect(fake.redditSent).toEqual([redditArgs]);
    expect(fake.xSent).toEqual([]);
    expect(fake.tokens).toEqual(["current-token"]);
    expect(await handle({ type: "clip", args })).toEqual({
      ok: true,
      itemId: "x-item",
    });
    expect(fake.xSent).toEqual([args]);
  });
  it("rejects malformed and unrelated messages before obtaining a token", async () => {
    const fake = client();
    const getToken = vi.fn(async () => "token");
    const handle = createClipHandler({ getToken, client: fake.client });
    for (const message of [
      { type: "other", args: redditArgs },
      { type: "clip-reddit", args: { post: redditArgs.post } },
      {
        type: "clip-reddit",
        args: {
          ...redditArgs,
          comments: [{ id: "c1", postId: "abc123", text: 3 }],
        },
      },
      null,
    ]) {
      expect(isClipRequest(message)).toBe(false);
      expect(await handle(message as never)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(getToken).not.toHaveBeenCalled();
    expect(fake.redditSent).toEqual([]);
  });
  it("retains signed-out behavior for Reddit without sending content", async () => {
    const fake = client();
    expect(
      await createClipHandler({
        getToken: async () => null,
        client: fake.client,
      })({ type: "clip-reddit", args: redditArgs }),
    ).toEqual({ ok: false, reason: "signed_out" });
    expect(fake.redditSent).toEqual([]);
  });
  it("returns a bounded oversized-selection hint without exposing exception text", async () => {
    const fake = client(async () => {
      throw new ConvexError({
        code: "INVALID_INPUT",
        hint: "content_too_large",
        message: "private content secret-token",
      });
    });
    expect(
      await createClipHandler({
        getToken: async () => "token",
        client: fake.client,
      })({ type: "clip-reddit", args: redditArgs }),
    ).toEqual({ ok: false, reason: "invalid", hint: "content_too_large" });
  });
  it("never converts a conflicting save into success", async () => {
    const fake = client(async () => {
      throw new ConvexError({ code: "CONFLICT", message: "private" });
    });
    expect(
      await createClipHandler({
        getToken: async () => "token",
        client: fake.client,
      })({ type: "clip-reddit", args: redditArgs }),
    ).toEqual({ ok: false, reason: "unknown" });
  });
});

/** A stand-in for the Convex client: records what was sent and what auth it used. */
function fakeClient(outcome: () => Promise<string> = async () => "item-1"): {
  client: {
    setAuth(token: string): void;
    createItem(a: typeof args): Promise<string>;
    clipReddit(
      a: ClipRedditArgs,
    ): Promise<{ itemId: string; addedCommentCount: number }>;
  };
  sent: unknown[];
  tokens: string[];
} {
  const sent: unknown[] = [];
  const tokens: string[] = [];
  return {
    sent,
    tokens,
    client: {
      setAuth: (token) => void tokens.push(token),
      createItem: async (a) => {
        sent.push(a);
        return outcome();
      },
      clipReddit: async () => ({
        itemId: await outcome(),
        addedCommentCount: 0,
      }),
    },
  };
}

const run = (
  getToken: () => Promise<string | null>,
  fake = fakeClient(),
): Promise<ClipResponse> =>
  createClipHandler({ getToken, client: fake.client })({ type: "clip", args });

describe("createClipHandler", () => {
  it("creates the item with the token and replies with its id", async () => {
    const fake = fakeClient();
    expect(await run(async () => "tok", fake)).toEqual({
      ok: true,
      itemId: "item-1",
    });
    expect(fake.tokens).toEqual(["tok"]);
    expect(fake.sent).toEqual([args]);
  });
  it("replies signed_out and sends nothing without a token", async () => {
    const fake = fakeClient();
    expect(await run(async () => null, fake)).toEqual({
      ok: false,
      reason: "signed_out",
    });
    expect(fake.sent).toEqual([]);
  });
  it.each([
    ["UNAUTHENTICATED", "signed_out"],
    ["INVALID_INPUT", "invalid"],
    ["CONFLICT", "unknown"],
  ] as const)("maps a %s ConvexError to %s", async (code, reason) => {
    const fake = fakeClient(async () => {
      throw new ConvexError({ code, message: "m" });
    });
    expect(await run(async () => "tok", fake)).toEqual({ ok: false, reason });
  });
  it("maps a failed request to network", async () => {
    const fake = fakeClient(async () => {
      throw new TypeError("NetworkError when attempting to fetch resource.");
    });
    expect(await run(async () => "tok", fake)).toEqual({
      ok: false,
      reason: "network",
    });
  });
  it("maps anything else, including a token failure, to unknown", async () => {
    const boom = fakeClient(async () => {
      throw new Error("boom");
    });
    expect(await run(async () => "tok", boom)).toEqual({
      ok: false,
      reason: "unknown",
    });
    expect(
      await run(async () => {
        throw new Error("clerk failed");
      }),
    ).toEqual({ ok: false, reason: "unknown" });
  });
  it("never logs the tweet text or the token", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const fake = fakeClient(async () => {
      throw new Error("boom");
    });
    await run(async () => "secret-token", fake);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("hello");
    spies.forEach((s) => s.mockRestore());
  });
});
