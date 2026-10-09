import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
it("shared capture and inclusion preserve counters, retries and existing attribution", async () => {
  const t = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await t.mutation(api.labels.create, { name: "Notes" });
  const { captureItem, decideMembership } = await import("./libraryWriters");
  const args = {
    inputType: "text" as const,
    originalInput: "  https://example.com  ",
    captureSource: "web" as const,
    captureKey: "note",
  };
  const itemId = await t.run(async (ctx) => {
    const owner = (await ctx.auth.getUserIdentity())!.tokenIdentifier;
    const id = await captureItem(ctx, owner, args);
    await decideMembership(ctx, owner, { itemId: id, labelId }, "include");
    expect(await captureItem(ctx, owner, args)).toBe(id);
    return id;
  });
  expect(await t.query(api.items.get, { id: itemId })).toMatchObject({
    inputType: "text",
    originalInput: args.originalInput,
  });
  expect(await t.query(api.items.stats, {})).toMatchObject({ total: 1 });
});
