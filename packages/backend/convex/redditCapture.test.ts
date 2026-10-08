import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { redditCommentUrl, redditPostUrl } from "../../schema/src/reddit";

// Save/merge behavior must not race scheduled labeling actions in these tests.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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

describe("Reddit inspector detail", () => {
  it("returns structured owned detail while keeping browsing/search previews bounded", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const result = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [comment],
    });
    const item = await alice.query(api.items.get, { id: result.itemId });
    const detail = await alice.query(api.items.detail, { id: result.itemId });
    expect(detail!.redditCapture).toEqual(item.redditCapture);
    expect(detail).not.toHaveProperty("captureKey");
    expect(detail).not.toHaveProperty("ownerId");
    expect(detail).not.toHaveProperty("pendingEnrichmentRunId");
    expect(detail).not.toHaveProperty("searchText");
    for (const page of [
      await alice.query(api.items.list, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      await alice.query(api.items.search, {
        query: "Reading",
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ]) {
      expect(page.page).toHaveLength(1);
      expect(page.page[0]).not.toHaveProperty("redditCapture");
      expect(page.page[0]).not.toHaveProperty("extractedText");
    }
  });

  it("hides foreign, malformed, missing, and deleted detail and rejects anonymous reads", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const bob = t.withIdentity({ subject: "bob", tokenIdentifier: "bob" });
    const result = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [comment],
    });
    expect(await bob.query(api.items.detail, { id: result.itemId })).toBeNull();
    expect(await alice.query(api.items.detail, { id: "malformed" })).toBeNull();
    await expect(
      t.query(api.items.detail, { id: result.itemId }),
    ).rejects.toThrow("Authentication required");
    await alice.mutation(api.items.remove, { id: result.itemId });
    expect(
      await alice.query(api.items.detail, { id: result.itemId }),
    ).toBeNull();
  });

  it.each([
    "https://example.com/article",
    "https://x.com/reader/status/123",
    redditPostUrl(post.id),
  ])(
    "preserves legacy detail without structured capture for %s",
    async (url) => {
      const alice = convexTest(schema, modules).withIdentity({
        subject: "alice",
        tokenIdentifier: "alice",
      });
      const id = await alice.mutation(api.items.create, {
        originalInput: url,
        inputType: "url",
        captureSource: "extension",
        captureKey: "legacy",
        sourceMetadata: { title: "Legacy" },
        extractedText: "Original text",
      });
      const detail = await alice.query(api.items.detail, { id });
      expect(detail).toMatchObject({
        originalInput: url,
        sourceMetadata: { title: "Legacy" },
        extractedText: "Original text",
      });
      expect(detail).not.toHaveProperty("redditCapture");
    },
  );
});

describe("Reddit repeated capture", () => {
  it("appends only new IDs, preserves snapshots/labels/runs, and leaves unchanged repeats untouched", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const labelId = await alice.mutation(api.labels.create, { name: "Books" });
    const initial = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [comment],
    });
    await alice.mutation(api.itemLabels.attach, {
      itemId: initial.itemId,
      labelId,
    });
    const before = await alice.query(api.items.get, { id: initial.itemId });
    const runsBefore = await t.run((ctx) =>
      ctx.db
        .query("processingRuns")
        .withIndex("by_owner_item", (q) =>
          q.eq("ownerId", "alice").eq("itemId", initial.itemId),
        )
        .take(10),
    );
    const linksBefore = await t.run((ctx) =>
      ctx.db
        .query("itemLabels")
        .withIndex("by_owner_pair", (q) =>
          q.eq("ownerId", "alice").eq("itemId", initial.itemId),
        )
        .take(10),
    );
    await t.run((ctx) => ctx.db.patch(initial.itemId, { updatedAt: 1 }));
    const result = await alice.mutation(api.items.clipReddit, {
      post: {
        ...post,
        title: "Edited title",
        text: "Edited post",
        images: [],
        outboundUrl: "https://example.com/edited",
      },
      comments: [
        { ...comment, text: "Edited comment" },
        { ...comment, id: "second", text: "SearchableAddition" },
        { ...comment, id: "third", text: "Third comment" },
        { ...comment, id: "second", text: "Duplicate changed" },
      ],
    });
    expect(result).toEqual({ itemId: initial.itemId, addedCommentCount: 2 });
    const after = await alice.query(api.items.get, { id: initial.itemId });
    expect(after._creationTime).toBe(before._creationTime);
    expect(after.updatedAt).toBeGreaterThan(1);
    expect(after.sourceMetadata).toEqual(before.sourceMetadata);
    expect(after.imageAssets).toEqual(before.imageAssets);
    expect(after.redditCapture!.postText).toBe(post.text);
    expect(after.redditCapture!.outboundUrl).toBe(post.outboundUrl);
    expect(after.redditCapture!.comments.map((c) => c.commentId)).toEqual([
      "def456",
      "second",
      "third",
    ]);
    expect(after.redditCapture!.comments[0]).toEqual(
      before.redditCapture!.comments[0],
    );
    expect(after.redditCapture!.comments[1]!.text).toBe("SearchableAddition");
    expect(after.searchText).toContain("SearchableAddition");
    expect(after.inbox).toBe(true); // First labeling run remains pending.
    const found = await alice.query(api.items.search, {
      query: "SearchableAddition",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(found.page.map((i) => i._id)).toEqual([initial.itemId]);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("processingRuns")
          .withIndex("by_owner_item", (q) =>
            q.eq("ownerId", "alice").eq("itemId", initial.itemId),
          )
          .take(10),
      ),
    ).toEqual(runsBefore);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("itemLabels")
          .withIndex("by_owner_pair", (q) =>
            q.eq("ownerId", "alice").eq("itemId", initial.itemId),
          )
          .take(10),
      ),
    ).toEqual(linksBefore);
    const stats = await t.run((ctx) =>
      ctx.db
        .query("ownerStats")
        .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
        .unique(),
    );
    const repeat = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [
        { ...comment, text: "Changed" },
        { ...comment, id: "second", text: "Changed" },
      ],
    });
    expect(repeat).toEqual({ itemId: initial.itemId, addedCommentCount: 0 });
    expect(await alice.query(api.items.get, { id: initial.itemId })).toEqual(
      after,
    );
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("ownerStats")
          .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
          .unique(),
      ),
    ).toEqual(stats);
  });

  it.each([false, true])(
    "forms the same overlapping ID union in either serial order (%s)",
    async (reverse) => {
      const alice = convexTest(schema, modules).withIdentity({
        subject: "alice",
        tokenIdentifier: "alice",
      });
      const requests = [
        ["first", "shared"],
        ["shared", "last"],
      ];
      if (reverse) requests.reverse();
      const results = [];
      for (const ids of requests)
        results.push(
          await alice.mutation(api.items.clipReddit, {
            post,
            comments: ids.map((id) => ({ ...comment, id })),
          }),
        );
      expect(results[0]!.itemId).toBe(results[1]!.itemId);
      expect(results[1]!.addedCommentCount).toBe(1);
      const saved = await alice.query(api.items.get, {
        id: results[0]!.itemId,
      });
      expect(saved.redditCapture!.comments.map((c) => c.commentId)).toEqual(
        reverse ? ["shared", "last", "first"] : ["first", "shared", "last"],
      );
    },
  );

  it("supports more than twenty saved comments through bounded requests", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const first = await alice.mutation(api.items.clipReddit, {
      post,
      comments: Array.from({ length: 20 }, (_, i) => ({
        ...comment,
        id: `c${i}`,
      })),
    });
    const second = await alice.mutation(api.items.clipReddit, {
      post,
      comments: Array.from({ length: 20 }, (_, i) => ({
        ...comment,
        id: `d${i}`,
      })),
    });
    expect(second).toEqual({ itemId: first.itemId, addedCommentCount: 20 });
    expect(
      (await alice.query(api.items.get, { id: first.itemId })).redditCapture!
        .comments,
    ).toHaveLength(40);
  });

  it("adopts matching legacy extension captures only when adding comments, preserving the first post", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const id = await alice.mutation(api.items.create, {
      captureSource: "extension",
      inputType: "url",
      originalInput: redditPostUrl(post.id),
      captureKey: "reddit:abc123",
      sourceMetadata: { title: "Legacy title", siteName: "Reddit" },
      extractedText: "Legacy available body",
      imageAssets: [],
    });
    const before = await alice.query(api.items.get, { id });
    expect(
      await alice.mutation(api.items.clipReddit, { post, comments: [] }),
    ).toEqual({ itemId: id, addedCommentCount: 0 });
    expect(await alice.query(api.items.get, { id })).toEqual(before);
    expect(
      await alice.mutation(api.items.clipReddit, { post, comments: [comment] }),
    ).toEqual({ itemId: id, addedCommentCount: 1 });
    const after = await alice.query(api.items.get, { id });
    expect(after.sourceMetadata).toEqual(before.sourceMetadata);
    expect(after.imageAssets).toEqual(before.imageAssets);
    expect(after.redditCapture!.postText).toBe("Legacy available body");
    expect(after.redditCapture!.outboundUrl).toBeUndefined();
    expect(after.extractedText).toContain("Legacy available body");
    expect(after.extractedText).not.toContain(post.text);
  });

  it.each(["text", "bytes"])(
    "rejects a combined %s overflow before updating anything",
    async (kind) => {
      const t = convexTest(schema, modules);
      const alice = t.withIdentity({
        subject: "alice",
        tokenIdentifier: "alice",
      });
      const text = (kind === "text" ? "x" : "\u0000").repeat(45_000);
      const result = await alice.mutation(api.items.clipReddit, {
        post: { ...post, text, images: [] },
        comments: [],
      });
      const before = await alice.query(api.items.get, { id: result.itemId });
      const stats = await t.run((ctx) =>
        ctx.db
          .query("ownerStats")
          .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
          .unique(),
      );
      await expect(
        alice.mutation(api.items.clipReddit, {
          post,
          comments: [
            {
              ...comment,
              text: (kind === "text" ? "y" : "\u0000").repeat(
                kind === "text" ? 60_000 : 35_000,
              ),
            },
          ],
        }),
      ).rejects.toThrow("content_too_large");
      expect(await alice.query(api.items.get, { id: result.itemId })).toEqual(
        before,
      );
      expect(
        await t.run((ctx) =>
          ctx.db
            .query("ownerStats")
            .withIndex("by_owner", (q) => q.eq("ownerId", "alice"))
            .unique(),
        ),
      ).toEqual(stats);
    },
  );

  it("keeps owners independent and deletes embedded snapshots with their item", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const bob = t.withIdentity({ subject: "bob", tokenIdentifier: "bob" });
    const a = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [comment],
    });
    const b = await bob.mutation(api.items.clipReddit, {
      post,
      comments: [{ ...comment, id: "bobcomment" }],
    });
    expect(a.itemId).not.toBe(b.itemId);
    expect(
      (
        await alice.query(api.items.get, { id: a.itemId })
      ).redditCapture!.comments.map((c) => c.commentId),
    ).toEqual(["def456"]);
    await expect(
      bob.mutation(api.items.remove, { id: a.itemId }),
    ).rejects.toThrow("Not found");
    await alice.mutation(api.items.remove, { id: a.itemId });
    expect(await t.run((ctx) => ctx.db.get(a.itemId))).toBeNull();
    expect(await bob.query(api.items.get, { id: b.itemId })).toBeDefined();
    const fresh = await alice.mutation(api.items.clipReddit, {
      post,
      comments: [{ ...comment, id: "newcomment" }],
    });
    expect(fresh.itemId).not.toBe(a.itemId);
    expect(
      (
        await alice.query(api.items.get, { id: fresh.itemId })
      ).redditCapture!.comments.map((c) => c.commentId),
    ).toEqual(["newcomment"]);
  });

  it.each([
    {
      inputType: "url" as const,
      captureSource: "web" as const,
      originalInput: redditPostUrl(post.id),
    },
    {
      inputType: "url" as const,
      captureSource: "extension" as const,
      originalInput: "https://www.reddit.com/comments/other/",
    },
    {
      inputType: "text" as const,
      captureSource: "extension" as const,
      originalInput: redditPostUrl(post.id),
    },
  ])("rejects unrelated key collisions (%j)", async (legacy) => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
      tokenIdentifier: "alice",
    });
    const id = await alice.mutation(api.items.create, {
      ...legacy,
      captureKey: "reddit:abc123",
    });
    const before = await alice.query(api.items.get, { id });
    await expect(
      alice.mutation(api.items.clipReddit, { post, comments: [comment] }),
    ).rejects.toThrow("CONFLICT");
    expect(await alice.query(api.items.get, { id })).toEqual(before);
  });
});

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
