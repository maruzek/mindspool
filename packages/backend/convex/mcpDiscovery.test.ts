import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { McpAuthorizationError } from "./mcp/auth";
import type { EnabledMcpConfig } from "./mcp/config";
import type { McpServices } from "./mcp/handler";
import { handleMcpRequest } from "./mcp/handler";
import { productionTools } from "./mcp/registry";
import schema from "./schema";
import { modules } from "./test.setup";

const resourceUrl = "https://dev.convex.site/mcp";
const config: EnabledMcpConfig = {
  enabled: true,
  environment: "development",
  resourceUrl,
  sessionIssuer: "https://issuer.example",
  clerkSecretKey: "sk_test_fixture",
  allowedOrigins: [],
  allowedClientIds: ["https://client.example"],
  allowedSubjects: [],
};

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  let n = 0;
  const save = (
    who: typeof alice,
    originalInput: string,
    inputType: "url" | "text" = "text",
  ) =>
    who.mutation(api.items.create, {
      originalInput,
      inputType,
      captureSource: "web",
      captureKey: `k${n++}`,
    });
  const label = (who: typeof alice, name: string, description?: string) =>
    who.mutation(api.labels.create, {
      name,
      ...(description ? { description } : {}),
    });
  const attach = (
    who: typeof alice,
    itemId: Id<"items">,
    labelId: Id<"labels">,
  ) => who.mutation(api.itemLabels.attach, { itemId, labelId });

  type Who = typeof alice;
  const services = async (
    who: Who,
    overrides: Partial<McpServices> = {},
  ): Promise<McpServices> => {
    const { ownerId } = await who.query(api.identity.current, {});
    return {
      config: () => config,
      now: () => Date.now(),
      verify: async () => ({
        issuer: config.sessionIssuer,
        subject: "user",
        clientId: "https://client.example",
        resource: resourceUrl,
        expiresAt: Date.now() + 60_000,
        scopes: ["mindspool:read"],
      }),
      admitIngress: async () => ({ allowed: true }),
      authorize: async () => ({
        ownerId,
        subject: "user",
        clientId: "https://client.example",
        connectionId: "connection",
        scopes: ["mindspool:read"],
      }),
      admitConnection: async () => ({ allowed: true }),
      runQuery: (query, args) => t.query(query, ...([args] as never)),
      tools: productionTools,
      record: async () => {},
      ...overrides,
    };
  };
  /** Calls a tool through the real handler; returns the JSON-RPC result. */
  const callTool = async (
    who: Who,
    name: string,
    args: Record<string, unknown> = {},
    overrides: Partial<McpServices> = {},
  ) => {
    const response = await handleMcpRequest(
      new Request(resourceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }),
      await services(who, overrides),
    );
    const body = await response.json();
    return { status: response.status, ...body.result, error: body.error };
  };
  return { t, alice, bob, save, label, attach, services, callTool };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Follows nextCursor until isDone, returning every page. */
async function allPages(
  { callTool }: Setup,
  who: Setup["alice"],
  name: string,
  args: Record<string, unknown>,
) {
  const pages = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const result = await callTool(who, name, {
      ...args,
      ...(cursor ? { cursor } : {}),
    });
    expect(result.isError).toBeFalsy();
    pages.push(result.structuredContent);
    if (result.structuredContent.page.isDone) return pages;
    cursor = result.structuredContent.page.nextCursor;
    expect(cursor).toEqual(expect.any(String));
  }
  throw new Error("pagination did not finish");
}

describe("mindspool_list_labels", () => {
  it("lists the caller's labels alphabetically with descriptions and hasItems", async () => {
    const s = await setup();
    const { alice, bob, save, label, attach } = s;
    const recipes = await label(alice, "Recipes", "Things to cook");
    await label(alice, "Empty");
    const excluded = await label(alice, "Excluded only");
    await label(bob, "Bob's private");
    const item = await save(alice, "Soup");
    await attach(alice, item, recipes);
    await attach(alice, item, excluded);
    await alice.mutation(api.itemLabels.remove, {
      itemId: item,
      labelId: excluded,
    });

    const result = await s.callTool(alice, "mindspool_list_labels");
    expect(result.structuredContent).toEqual({
      labels: [
        { id: expect.any(String), name: "Empty", hasItems: false },
        { id: expect.any(String), name: "Excluded only", hasItems: false },
        {
          id: recipes,
          name: "Recipes",
          description: "Things to cook",
          hasItems: true,
        },
      ],
      page: { isDone: true, returned: 3 },
    });
    expect(JSON.parse(result.content[0].text)).toEqual(
      result.structuredContent,
    );
    expect(JSON.stringify(result)).not.toContain("Bob");
  });

  it("pages with limit until isDone", async () => {
    const s = await setup();
    for (const name of ["a", "b", "c", "d", "e"]) await s.label(s.alice, name);
    const pages = await allPages(s, s.alice, "mindspool_list_labels", {
      limit: 2,
    });
    expect(
      pages.map((p) => p.labels.map((l: { name: string }) => l.name)),
    ).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(pages.map((p) => p.page.returned)).toEqual([2, 2, 1]);
  });

  it("rejects limits outside 1..50", async () => {
    const s = await setup();
    const result = await s.callTool(s.alice, "mindspool_list_labels", {
      limit: 51,
    });
    expect(result.isError).toBe(true);
  });

  it("executes nothing for a token without read access", async () => {
    const s = await setup();
    const runQuery = vi.fn();
    const result = await s.callTool(
      s.alice,
      "mindspool_list_labels",
      {},
      {
        runQuery,
        verify: async () => {
          throw new McpAuthorizationError("insufficient_scope");
        },
      },
    );
    expect(result.status).toBe(403);
    expect(runQuery).not.toHaveBeenCalled();
  });
});

describe("mindspool_browse_items", () => {
  it("lists the whole library newest first, including unlabeled clips", async () => {
    const s = await setup();
    const first = await s.save(s.alice, "First note");
    const second = await s.save(s.alice, "https://example.com/page", "url");
    await s.save(s.bob, "Bob's note");
    const result = await s.callTool(s.alice, "mindspool_browse_items");
    expect(
      result.structuredContent.items.map((i: { itemId: string }) => i.itemId),
    ).toEqual([second, first]);
    expect(result.structuredContent.page).toEqual({
      isDone: true,
      returned: 2,
    });
    expect(result.structuredContent).not.toHaveProperty("label");
    expect(result.structuredContent.items[0]).toMatchObject({
      url: "https://example.com/page",
      preview: "https://example.com/page",
      inputType: "url",
      enrichment: "pending",
      labels: [],
      labelCount: 0,
      savedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });

  it("enumerates a 25-clip label fully, in the app's order, without duplicates", async () => {
    const s = await setup();
    const labelId = await s.label(s.alice, "Landing Page");
    const other = await s.label(s.alice, "Other");
    for (let i = 0; i < 25; i++) {
      const itemId = await s.save(s.alice, `Resource ${i}`);
      await s.attach(s.alice, itemId, labelId);
      if (i % 5 === 0)
        await s.attach(s.alice, await s.save(s.alice, `Noise ${i}`), other);
    }
    const pages = await allPages(s, s.alice, "mindspool_browse_items", {
      labelName: "landing page",
    });
    expect(pages.map((p) => p.page.isDone)).toEqual([false, false, true]);
    expect(pages.every((p) => p.label.name === "Landing Page")).toBe(true);
    const seen = pages.flatMap((p) =>
      p.items.map((i: { itemId: string }) => i.itemId),
    );
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);

    // Parity with the web app's own label listing.
    const app: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: {
        page: { _id: string }[];
        isDone: boolean;
        continueCursor: string;
      } = await s.alice.query(api.itemLabels.listItemsForLabel, {
        labelId,
        paginationOpts: { numItems: 10, cursor },
      });
      app.push(...page.page.map((i) => i._id));
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(seen).toEqual(app);
  });

  it("keeps paging past an empty non-final page", async () => {
    const s = await setup();
    const labelId = await s.label(s.alice, "Gaps");
    const items: Id<"items">[] = [];
    for (let i = 0; i < 15; i++) {
      const itemId = await s.save(s.alice, `Item ${i}`);
      await s.attach(s.alice, itemId, labelId);
      items.push(itemId);
    }
    // Deleted items whose links the background purge has not removed yet.
    await s.t.run(async (ctx) => {
      for (const itemId of items.slice(5)) await ctx.db.delete(itemId);
    });
    const pages = await allPages(s, s.alice, "mindspool_browse_items", {
      labelId,
    });
    expect(pages[0].items).toEqual([]);
    expect(pages[0].page).toMatchObject({ isDone: false, returned: 0 });
    expect(
      pages.flatMap((p) => p.items.map((i: { itemId: string }) => i.itemId)),
    ).toEqual(items.slice(0, 5).reverse());
  });

  it("hides excluded clips and marks suggested labels; needsReview narrows to them", async () => {
    const s = await setup();
    const labelId = await s.label(s.alice, "Tools");
    const confirmed = await s.save(s.alice, "Confirmed tool");
    const excluded = await s.save(s.alice, "Excluded tool");
    const suggested = await s.save(s.alice, "Suggested tool");
    await s.attach(s.alice, confirmed, labelId);
    await s.attach(s.alice, excluded, labelId);
    await s.alice.mutation(api.itemLabels.remove, {
      itemId: excluded,
      labelId,
    });
    // An unconfirmed model suggestion, through the real labeling path.
    const runId = await s.t.mutation(internal.processingRuns.start, {
      itemId: suggested,
      kind: "decision",
      provider: "clef-flash",
      model: "clef-flash",
      modality: "text",
      questionVersion: "v1",
    });
    await s.t.mutation(internal.decisions.complete, {
      runId,
      itemId: suggested,
      suggestions: [{ labelId, confidence: 0.55 }],
      model: "clef-flash",
    });

    const all = await s.callTool(s.alice, "mindspool_browse_items", {
      labelId,
    });
    const byId = Object.fromEntries(
      all.structuredContent.items.map((i: { itemId: string }) => [i.itemId, i]),
    );
    expect(Object.keys(byId).sort()).toEqual([confirmed, suggested].sort());
    expect(byId[confirmed].labels).toEqual([{ id: labelId, name: "Tools" }]);
    expect(byId[suggested].labels).toEqual([
      { id: labelId, name: "Tools", suggested: true },
    ]);

    const review = await s.callTool(s.alice, "mindspool_browse_items", {
      labelId,
      needsReview: true,
    });
    expect(
      review.structuredContent.items.map((i: { itemId: string }) => i.itemId),
    ).toEqual([suggested]);
  });

  it("filters by source", async () => {
    const s = await setup();
    await s.save(s.alice, "A note");
    const link = await s.save(s.alice, "https://example.com/a", "url");
    const result = await s.callTool(s.alice, "mindspool_browse_items", {
      source: "web",
    });
    expect(
      result.structuredContent.items.map((i: { itemId: string }) => i.itemId),
    ).toEqual([link]);
  });

  it("returns a snippet of saved content and at most three labels with the true count", async () => {
    const s = await setup();
    const itemId = await s.save(s.alice, "Long one");
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, { extractedText: `  ${"word ".repeat(60)}\n end` }),
    );
    for (const name of ["a", "b", "c", "d"])
      await s.attach(s.alice, itemId, await s.label(s.alice, name));
    const [item] = (await s.callTool(s.alice, "mindspool_browse_items"))
      .structuredContent.items;
    expect(item.snippet.endsWith("…")).toBe(true);
    expect(item.snippet.length).toBeLessThanOrEqual(121);
    expect(item.snippet).not.toMatch(/^\s|\n/);
    expect(item.labels).toHaveLength(3);
    expect(item.labelCount).toBe(4);
  });

  it("resolves names exactly and case-insensitively, never fuzzily", async () => {
    const s = await setup();
    await s.label(s.alice, "Landing Page");
    const near = await s.callTool(s.alice, "mindspool_browse_items", {
      labelName: "Landing",
    });
    expect(near.isError).toBe(true);
    expect(near.structuredContent.error).toEqual({
      code: "NOT_FOUND",
      message: "No label with that name; call mindspool_list_labels",
      retryable: false,
    });
    const both = await s.callTool(s.alice, "mindspool_browse_items", {
      labelName: "Landing Page",
      labelId: "x",
    });
    expect(both.structuredContent.error.code).toBe("INVALID_INPUT");
  });

  it("treats a foreign label id exactly like a missing one", async () => {
    const s = await setup();
    const foreign = await s.label(s.bob, "Secret");
    await s.attach(s.bob, await s.save(s.bob, "Bob's clip"), foreign);
    const own = await s.label(s.alice, "Mine");
    await s.t.run((ctx) => ctx.db.delete(own));
    const results = await Promise.all(
      [foreign, own, "not-an-id"].map((labelId) =>
        s.callTool(s.alice, "mindspool_browse_items", { labelId }),
      ),
    );
    for (const result of results)
      expect(result.structuredContent.error).toEqual({
        code: "NOT_FOUND",
        message: "Not found",
        retryable: false,
      });
    expect(JSON.stringify(results)).not.toContain("Bob");
  });

  it("rejects a cursor issued for other filters or tampered with", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) await s.save(s.alice, `Note ${i}`);
    const first = await s.callTool(s.alice, "mindspool_browse_items");
    const cursor = first.structuredContent.page.nextCursor;
    for (const args of [
      { cursor, source: "note" },
      { cursor: `${cursor}x` },
      { cursor: "garbage" },
    ]) {
      const result = await s.callTool(s.alice, "mindspool_browse_items", args);
      expect(result.structuredContent.error.code).toBe("INVALID_INPUT");
    }
  });

  it("does not let another owner continue a cursor into this library", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) await s.save(s.alice, `Note ${i}`);
    await s.save(s.bob, "Bob's only note");
    const first = await s.callTool(s.alice, "mindspool_browse_items");
    const stolen = await s.callTool(s.bob, "mindspool_browse_items", {
      cursor: first.structuredContent.page.nextCursor,
    });
    expect(JSON.stringify(stolen)).not.toContain("Note ");
  });

  it("maps Convex read-limit failures to a retryable UNAVAILABLE", async () => {
    const s = await setup();
    const result = await s.callTool(
      s.alice,
      "mindspool_browse_items",
      {},
      {
        runQuery: async () => {
          throw new Error("Too many bytes read in a single function execution");
        },
      },
    );
    expect(result.structuredContent.error).toEqual({
      code: "UNAVAILABLE",
      message: "Read limit reached; retry",
      retryable: true,
    });
  });

  it("lists the discovery tools read-only with descriptions that state the contract", async () => {
    const tools = Object.fromEntries(
      productionTools.map((tool) => [tool.name, tool]),
    );
    expect(Object.keys(tools)).toEqual([
      "mindspool_connection",
      "mindspool_list_labels",
      "mindspool_browse_items",
    ]);
    for (const tool of Object.values(tools)) {
      expect(tool.requiredScopes).toEqual(["mindspool:read"]);
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    const browse = tools.mindspool_browse_items!.description;
    expect(browse).toContain("until page.isDone is true");
    expect(browse).toContain("not search");
    expect(browse).toContain("partial");
    expect(browse).toContain("untrusted");
  });
});
