import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
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

describe("allowed subjects guard", () => {
  afterEach(() => vi.unstubAllEnvs());
  const as = (subject: string) =>
    convexTest(schema, modules).withIdentity({ subject });

  it("allows a listed subject and trims the list", async () => {
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_a , user_b");
    expect(await as("user_b").query(requireOwner)).toContain("user_b");
  });

  it("refuses an unlisted subject with FORBIDDEN", async () => {
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_a");
    await expect(as("user_x").query(requireOwner)).rejects.toThrow("FORBIDDEN");
  });

  it("does not restrict when unset or empty", async () => {
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "");
    expect(await as("anyone").query(requireOwner)).toContain("anyone");
  });

  it("still reports unauthenticated before the allow list", async () => {
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_a");
    await expect(
      convexTest(schema, modules).query(requireOwner),
    ).rejects.toThrow("Authentication required");
  });

  it("refuses a user on public library functions", async () => {
    vi.stubEnv("MINDSPOOL_ALLOWED_SUBJECTS", "user_a");
    const refused = as("user_x");
    await expect(
      refused.query(api.items.list, {
        paginationOpts: { numItems: 5, cursor: null },
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      refused.mutation(api.items.create, {
        inputType: "text",
        originalInput: "hi",
        captureSource: "web",
        captureKey: "k1",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});
