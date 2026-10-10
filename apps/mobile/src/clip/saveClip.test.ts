import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { fakeFetch } from "../x/fixtures";
import {
  messageOf,
  outcomeOfError,
  prepareClip,
  saveShared,
  submitClip,
} from "./saveClip";
import type { ClipResult } from "../x/buildClip";

const clip: ClipResult = {
  linkOnly: false,
  args: {
    originalInput: "https://x.com/NASA/status/2108662426606395572",
    inputType: "url",
    captureSource: "mobile",
    captureKey: "x:2108662426606395572",
  },
};

describe("prepareClip", () => {
  const shared = "https://x.com/NASA/status/2108662426606395572?s=20";

  it("builds a clip and preview from a shared post", async () => {
    const prepared = await prepareClip(shared, {
      fetch: fakeFetch({ fx: [200, "fx-photo.json"] }),
    });
    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") return;
    expect(prepared.clip.linkOnly).toBe(false);
    expect(prepared.clip.args.captureSource).toBe("mobile");
    expect(prepared.preview).toMatchObject({
      host: "x.com",
      title: "NASA (@NASA)",
      image: "https://pbs.twimg.com/media/HUN5TRIXQAAuu31.jpg?name=large",
    });
  });

  it("falls back to the bare link when nothing resolves", async () => {
    const prepared = await prepareClip(shared, { fetch: fakeFetch({}) });
    expect(prepared).toMatchObject({
      kind: "ready",
      clip: { linkOnly: true },
      preview: { title: "https://x.com/NASA/status/2108662426606395572" },
    });
  });

  it("refuses links that are not X posts without fetching", async () => {
    const fetch = fakeFetch({});
    expect(await prepareClip("https://example.com/a", { fetch })).toEqual({
      kind: "unsupported",
    });
    expect(fetch.calls).toEqual([]);
  });
});

describe("outcomeOfError", () => {
  it("treats CONFLICT as already saved", () => {
    expect(
      outcomeOfError(new ConvexError({ code: "CONFLICT", message: "x" })),
    ).toEqual({ kind: "already" });
  });

  it("maps INVALID_INPUT to too large", () => {
    expect(
      outcomeOfError(new ConvexError({ code: "INVALID_INPUT", message: "x" })),
    ).toEqual({ kind: "error", reason: "too_large" });
  });

  it.each([
    new ConvexError({ code: "UNAUTHENTICATED" }),
    new ConvexError("text"),
    new Error("boom"),
    "nope",
  ])("maps %j to a generic error", (error) => {
    expect(outcomeOfError(error)).toEqual({ kind: "error", reason: "other" });
  });
});

describe("submitClip", () => {
  it("saves once with the clip's arguments", async () => {
    const create = vi.fn().mockResolvedValue("id");
    expect(await submitClip(clip, create)).toEqual({ kind: "saved" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(clip.args);
  });

  it("reports a link-only save", async () => {
    const create = vi.fn().mockResolvedValue("id");
    expect(await submitClip({ ...clip, linkOnly: true }, create)).toEqual({
      kind: "link",
    });
  });

  it("reports an existing item as already saved", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new ConvexError({ code: "CONFLICT" }));
    expect(await submitClip(clip, create)).toEqual({ kind: "already" });
  });

  it("reports no connection when the call never settles", async () => {
    const create = vi.fn(() => new Promise<never>(() => {}));
    expect(await submitClip(clip, create, 10)).toEqual({
      kind: "error",
      reason: "network",
    });
  });
});

describe("saveShared", () => {
  const shared = "https://x.com/NASA/status/2108662426606395572?s=20";

  it("fetches and saves a post once", async () => {
    const create = vi.fn().mockResolvedValue("id");
    const outcome = await saveShared(shared, {
      fetch: fakeFetch({ fx: [200, "fx-photo.json"] }),
      create,
    });
    expect(outcome).toEqual({ kind: "saved" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      captureKey: "x:2108662426606395572",
      captureSource: "mobile",
    });
  });

  it("saves nothing for links that are not X posts", async () => {
    const create = vi.fn();
    const outcome = await saveShared("https://example.com", {
      fetch: fakeFetch({}),
      create,
    });
    expect(outcome).toEqual({ kind: "unsupported" });
    expect(create).not.toHaveBeenCalled();
  });

  it("saves the bare link when the post cannot be fetched", async () => {
    const create = vi.fn().mockResolvedValue("id");
    expect(await saveShared(shared, { fetch: fakeFetch({}), create })).toEqual({
      kind: "link",
    });
  });
});

describe("messageOf", () => {
  it.each([
    [{ kind: "saved" }, "Saved to MindSpool"],
    [{ kind: "already" }, "Already saved"],
    [{ kind: "unsupported" }, "Only X posts are supported yet"],
    [{ kind: "error", reason: "network" }, "No connection, try again"],
    [
      { kind: "error", reason: "too_large" },
      "This capture is too large to save",
    ],
    [{ kind: "error", reason: "other" }, "Something went wrong"],
  ] as const)("%j", (outcome, message) => {
    expect(messageOf(outcome)).toBe(message);
  });
});
