import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { requireOwner, requireOwned } from "./auth";
import schema from "./schema";
import { modules } from "./test.setup";

describe("verified ownership", () => {
  it("rejects anonymous access", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(requireOwner)).rejects.toThrow(
      "Authentication required",
    );
  });

  it("derives the owner from the verified token identifier", async () => {
    const t = convexTest(schema, modules).withIdentity({
      issuer: "https://first.clerk.accounts.dev",
      subject: "user_1",
      tokenIdentifier: "https://first.clerk.accounts.dev|user_1",
    });
    expect(await t.query(requireOwner)).toBe(
      "https://first.clerk.accounts.dev|user_1",
    );
  });

  it("distinguishes the same subject issued by different providers", async () => {
    const t = convexTest(schema, modules);
    const first = t.withIdentity({
      issuer: "https://first.example",
      subject: "user_1",
    });
    const second = t.withIdentity({
      issuer: "https://second.example",
      subject: "user_1",
    });
    expect(await first.query(requireOwner)).not.toBe(
      await second.query(requireOwner),
    );
  });

  it("returns the document when its owner matches", () => {
    const document = { ownerId: "owner_1", originalInput: "Keep this" };
    expect(requireOwned(document, "owner_1")).toEqual(document);
  });

  it("rejects foreign and absent documents with the same error", () => {
    expect(() => requireOwned({ ownerId: "owner_2" }, "owner_1")).toThrow(
      "Not found",
    );
    expect(() => requireOwned(null, "owner_1")).toThrow("Not found");
  });
});
