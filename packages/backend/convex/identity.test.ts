import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

it("rejects an anonymous identity query", async () => {
  await expect(
    convexTest(schema, modules).query(api.identity.current, {}),
  ).rejects.toThrow("Authentication required");
});

it("returns only the verified owner identifier", async () => {
  const t = convexTest(schema, modules).withIdentity({
    subject: "alice",
    tokenIdentifier: "verified-owner",
  });
  expect(await t.query(api.identity.current, {})).toEqual({
    ownerId: "verified-owner",
  });
});
