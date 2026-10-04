import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const capture = {
  inputType: "url" as const,
  originalInput: "https://example.com/recipe?keep=1",
  captureSource: "web" as const,
  captureKey: "capture-1",
};

describe("owned Item capture", () => {
  it("returns bounded list previews while preserving full original content in detail", async () => {
    const alice = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const originalInput = "A".repeat(100000);
    const id = await alice.mutation(api.items.create, {
      ...capture,
      inputType: "text",
      originalInput,
    });
    const page = await alice.query(api.items.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page[0]!.originalInput).toBe(originalInput.slice(0, 160));
    expect(page.page[0]).not.toHaveProperty("imageAssets");
    expect((await alice.query(api.items.get, { id })).originalInput).toBe(
      originalInput,
    );
  });
  it("paginates only the owner's newest Items", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        await alice.mutation(api.items.create, {
          ...capture,
          captureKey: `page-${i}`,
        }),
      );
    await t
      .withIdentity({ subject: "bob" })
      .mutation(api.items.create, capture);
    const first = await alice.query(api.items.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((item) => item._id)).toEqual([ids[2], ids[1]]);
    const next = await alice.query(api.items.list, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(next.page.map((item) => item._id)).toEqual([ids[0]]);
    expect(next.isDone).toBe(true);
    await expect(
      t.query(api.items.list, {
        paginationOpts: { numItems: 2, cursor: null },
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      alice.query(api.items.list, {
        paginationOpts: { numItems: 101, cursor: null },
      }),
    ).rejects.toThrow("Page size");
  });
  it("preserves original input before enrichment", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await asUser.mutation(api.items.create, capture);
    expect(await asUser.query(api.items.get, { id })).toMatchObject({
      originalInput: capture.originalInput,
      originalUrl: capture.originalInput,
      captureSource: "web",
      captureStatus: "captured",
      enrichmentStatus: "not_started",
      imageAssets: [],
    });
  });

  it("preserves whitespace in saved text", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await asUser.mutation(api.items.create, {
      ...capture,
      inputType: "text",
      originalInput: "  Useful idea\n",
    });
    const item = await asUser.query(api.items.get, { id });
    expect(item.originalInput).toBe("  Useful idea\n");
    expect(item.originalUrl).toBeUndefined();
  });

  it("rejects anonymous capture and detail access", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.items.create, capture)).rejects.toThrow(
      "Authentication required",
    );
    const id = await t
      .withIdentity({ subject: "alice" })
      .mutation(api.items.create, capture);
    await expect(t.query(api.items.get, { id })).rejects.toThrow(
      "Authentication required",
    );
  });

  it("hides foreign and nonexistent ids behind the same error", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice" });
    const id = await alice.mutation(api.items.create, capture);
    await expect(
      t.withIdentity({ subject: "bob" }).query(api.items.get, { id }),
    ).rejects.toThrow("Not found");
    await t.run(async (ctx) => {
      await ctx.db.delete(id);
    });
    await expect(alice.query(api.items.get, { id })).rejects.toThrow(
      "Not found",
    );
  });

  it("replays the same capture while refusing key reuse with different input", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    const id = await asUser.mutation(api.items.create, capture);
    expect(await asUser.mutation(api.items.create, capture)).toBe(id);
    await expect(
      asUser.mutation(api.items.create, {
        ...capture,
        originalInput: "https://example.com/other",
      }),
    ).rejects.toThrow("Capture key already used");
    expect(
      await asUser.mutation(api.items.create, {
        ...capture,
        captureKey: "capture-2",
      }),
    ).not.toBe(id);
  });

  it("scopes capture keys to the owner", async () => {
    const t = convexTest(schema, modules);
    const first = await t
      .withIdentity({ subject: "alice" })
      .mutation(api.items.create, capture);
    const second = await t
      .withIdentity({ subject: "bob" })
      .mutation(api.items.create, capture);
    expect(first).not.toBe(second);
  });

  it.each([
    "javascript:alert(1)",
    "file:///tmp/private",
    "not a URL",
    "https://user:password@example.com/",
  ])("rejects an unsafe URL: %s", async (originalInput) => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    await expect(
      asUser.mutation(api.items.create, { ...capture, originalInput }),
    ).rejects.toThrow("Invalid URL");
  });

  it("rejects blank or oversized input without writing", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "alice" });
    for (const originalInput of ["   ", "a".repeat(100001)]) {
      await expect(
        asUser.mutation(api.items.create, {
          ...capture,
          inputType: "text",
          originalInput,
        }),
      ).rejects.toThrow("Invalid input");
    }
    await expect(
      asUser.mutation(api.items.create, {
        ...capture,
        originalInput: "https://example.com/" + "a".repeat(8192),
      }),
    ).rejects.toThrow("Invalid input");
    expect(await t.run((ctx) => ctx.db.query("items").take(1))).toEqual([]);
  });

  it("rejects an owner supplied by the client", async () => {
    const asUser = convexTest(schema, modules).withIdentity({
      subject: "alice",
    });
    await expect(
      asUser.mutation(api.items.create, {
        ...capture,
        ownerId: "bob",
      } as typeof capture),
    ).rejects.toThrow();
  });
});
