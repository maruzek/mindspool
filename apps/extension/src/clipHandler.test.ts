import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { buildClip } from "./clip";
import { createClipHandler } from "./clipHandler";
import type { ClipResponse } from "./messages";

const args = buildClip({
  id: "1",
  url: "https://x.com/jane/status/1",
  author: "Jane",
  handle: "jane",
  text: "hello",
  images: [],
});

/** A stand-in for the Convex client: records what was sent and what auth it used. */
function fakeClient(outcome: () => Promise<string> = async () => "item-1"): {
  client: {
    setAuth(token: string): void;
    createItem(a: typeof args): Promise<string>;
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
