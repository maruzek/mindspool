import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { redditCommentUrl, redditPostUrl } from "../../schema/src/reddit";

const post = {
  id: "t3_ABC123",
  title: "  Reading ideas  ",
  author: "u/reader",
  subreddit: "books",
  text: "A paragraph\n\nA second 📚",
  outboundUrl: "https://example.com/article?keep=1",
  images: ["https://preview.redd.it/image.png?width=640"],
};
const comment = {
  id: "t1_DEF456",
  postId: "t3_ABC123",
  author: "u/commenter",
  text: "A useful comment",
};

describe("Reddit first capture", () => {
  it("includes initial comments in labeling and succeeds at the AI limit", async () => {
    for (const limited of [false, true]) {
      const t = convexTest(schema, modules);
      const alice = t.withIdentity({
        subject: "alice",
        tokenIdentifier: "alice",
      });
      await alice.mutation(api.labels.create, { name: "Books" });
      if (limited) vi.stubEnv("AI_DAILY_NEURON_LIMIT", "1");
      try {
        const result = await alice.mutation(api.items.clipReddit, {
          post,
          comments: [comment],
        });
        const item = await alice.query(api.items.get, { id: result.itemId });
        expect(item.extractedText).toContain(comment.text);
        const runs = await t.run((ctx) =>
          ctx.db
            .query("processingRuns")
            .withIndex("by_owner_item", (q) =>
              q.eq("ownerId", "alice").eq("itemId", result.itemId),
            )
            .take(10),
        );
        expect(runs).toHaveLength(1);
        expect(runs[0]!.status).toBe(limited ? "failed" : "pending");
        if (limited) expect(runs[0]!.error).toBe("Daily AI limit reached");
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });
  it("derives identity, structured server-timed snapshots, content, and owner state", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const before = Date.now();
    const result = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [comment, { ...comment, text: "Ignored duplicate" }],
    });
    expect(result.addedCommentCount).toBe(1);
    const item = await alice.query(api.items.get, { id: result.itemId });
    expect(item).toMatchObject({
      captureKey: "reddit:abc123",
      captureSource: "extension",
      inputType: "url",
      originalInput: redditPostUrl(post.id),
      originalUrl: redditPostUrl(post.id),
      sourceKind: "reddit",
      sourceMetadata: {
        title: "Reading ideas",
        author: post.author,
        description: `r/${post.subreddit}`,
        siteName: "Reddit",
      },
      imageAssets: [
        { kind: "external", url: post.images[0], purpose: "image" },
      ],
      redditCapture: {
        postId: "abc123",
        postText: post.text,
        outboundUrl: post.outboundUrl,
        comments: [
          {
            commentId: "def456",
            postId: "abc123",
            permalink: redditCommentUrl(post.id, comment.id),
            author: comment.author,
            text: comment.text,
          },
        ],
      },
      inbox: true,
    });
    expect(item.redditCapture!.comments[0]!.capturedAt).toBeGreaterThanOrEqual(
      before,
    );
    expect(item.redditCapture!.comments[0]!.capturedAt).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(item.extractedText).toBe(
      `Post\n\n${post.text}\n\n${post.outboundUrl}\n\nSelected comments\n\n${comment.author}\n${comment.text}\n${redditCommentUrl(post.id, comment.id)}`,
    );
    expect(item.searchText).toContain(comment.text);
    const stats = await t.run((ctx) =>
      ctx.db
        .query("ownerStats")
        .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
        .unique(),
    );
    expect(stats).toMatchObject({ total: 1, inbox: 1, needsReview: 0 });
  });

  it("accepts title-only posts, omits unavailable metadata, and deduplicates images", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const result = await alice.mutation(api.items.clipReddit, {
      post: {
        id: "abc123",
        title: "Title only",
        text: "",
        images: [post.images[0]!, post.images[0]!],
      },
      comments: [],
    });
    expect(result.addedCommentCount).toBe(0);
    const item = await alice.query(api.items.get, { id: result.itemId });
    expect(item.sourceMetadata).toEqual({
      title: "Title only",
      siteName: "Reddit",
    });
    expect(item.imageAssets).toHaveLength(1);
    expect(item.redditCapture).toEqual({
      postId: "abc123",
      postText: "",
      comments: [],
    });
  });

  it("rejects anonymous capture", async () => {
    await expect(
      convexTest(schema, modules).mutation(api.items.clipReddit, {
        post,
        comments: [],
      }),
    ).rejects.toThrow("Authentication required");
  });

  it.each([
    { name: "invalid post", post: { ...post, id: "t1_abc123" }, comments: [] },
    { name: "empty title", post: { ...post, title: " " }, comments: [] },
    {
      name: "long title",
      post: { ...post, title: "x".repeat(301) },
      comments: [],
    },
    {
      name: "long metadata",
      post: { ...post, author: "x".repeat(301) },
      comments: [],
    },
    {
      name: "unsafe outbound",
      post: { ...post, outboundUrl: "javascript:alert(1)" },
      comments: [],
    },
    {
      name: "credential outbound",
      post: { ...post, outboundUrl: "https://user:pass@example.com" },
      comments: [],
    },
    {
      name: "unsafe image",
      post: { ...post, images: ["http://example.com/image"] },
      comments: [],
    },
    {
      name: "too many images",
      post: {
        ...post,
        images: Array.from(
          { length: 11 },
          (_, i) => `https://example.com/${i}`,
        ),
      },
      comments: [],
    },
    { name: "wrong post", post, comments: [{ ...comment, postId: "other" }] },
    {
      name: "invalid comment",
      post,
      comments: [{ ...comment, id: "t3_def456" }],
    },
    { name: "empty comment", post, comments: [{ ...comment, text: " " }] },
    {
      name: "long comment author",
      post,
      comments: [{ ...comment, author: "x".repeat(301) }],
    },
    {
      name: "selection limit",
      post,
      comments: Array.from({ length: 21 }, (_, i) => ({
        ...comment,
        id: `c${i}`,
      })),
    },
  ])("rejects $name atomically", async ({ post, comments }) => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    await expect(
      alice.mutation(api.items.clipReddit, { post, comments }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("items")
          .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
          .first(),
      ),
    ).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("ownerStats")
          .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
          .first(),
      ),
    ).toBeNull();
  });

  it.each([
    { name: "rendered text", text: "x".repeat(100_000) },
    { name: "serialized bytes", text: "\u0000".repeat(80_000) },
  ])("rejects excessive $name with bounded size feedback", async ({ text }) => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    await expect(
      alice.mutation(api.items.clipReddit, {
        post: { ...post, text },
        comments: [],
      }),
    ).rejects.toThrow("content_too_large");
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("items")
          .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
          .first(),
      ),
    ).toBeNull();
  });

  it("accepts the exact rendered text boundary without truncation", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const result = await alice.mutation(api.items.clipReddit, {
      post: {
        id: "abc123",
        title: "Boundary",
        text: "漢".repeat(99_994),
        images: [],
      },
      comments: [],
    });
    const item = await alice.query(api.items.get, { id: result.itemId });
    expect(item.extractedText).toHaveLength(100_000);
    expect(item.redditCapture!.postText).toHaveLength(99_994);
  });
});
