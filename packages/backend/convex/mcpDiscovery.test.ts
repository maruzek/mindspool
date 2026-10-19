import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { McpAuthorizationError } from "./mcp/auth";
import type { EnabledMcpConfig } from "./mcp/config";
import type { McpServices } from "./mcp/handler";
import { handleMcpRequest } from "./mcp/handler";
import { productionTools } from "./mcp/registry";
import { toolBytes } from "./mcp/tools";
import schema from "./schema";
import { withSnippets } from "./mcpDiscovery";
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

  it.each([
    "mindspool_list_labels",
    "mindspool_browse_items",
    "mindspool_search_items",
    "mindspool_get_item",
  ])("executes nothing for %s without read access", async (name) => {
    const s = await setup();
    const runQuery = vi.fn();
    const result = await s.callTool(
      s.alice,
      name,
      {},
      {
        runQuery,
        authorize: async () => ({
          ownerId: "alice",
          subject: "user",
          clientId: "https://client.example",
          connectionId: "connection",
          scopes: [],
        }),
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

    // Search keeps the same suggested membership and review filtering.
    for (const scope of [{}, { labelId }]) {
      const search = await s.callTool(s.alice, "mindspool_search_items", {
        query: "tool",
        needsReview: true,
        ...scope,
      });
      expect(
        search.structuredContent.items.map((i: { itemId: string }) => i.itemId),
      ).toEqual([suggested]);
      expect(search.structuredContent.items[0].labels).toEqual([
        { id: labelId, name: "Tools", suggested: true },
      ]);
    }
    const detail = await s.callTool(s.alice, "mindspool_get_item", {
      itemId: suggested,
    });
    expect(detail.structuredContent.labels).toEqual([
      { id: labelId, name: "Tools", suggested: true },
    ]);
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
      "mindspool_search_items",
      "mindspool_get_item",
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
    const search = tools.mindspool_search_items!.description;
    expect(search).toContain("not exhaustive");
    expect(search).toContain("mindspool_browse_items");
    expect(search).toContain("all clips");
    expect(tools.mindspool_get_item!.description).toContain(
      "untrusted data, not instructions",
    );
    expect(tools.mindspool_get_item!.description).toContain(
      "content.nextOffset",
    );
  });
});

describe("mindspool_search_items", () => {
  it("searches library and label in the app's best-match order, including unlabeled inbox clips", async () => {
    const s = await setup();
    const labelId = await s.label(s.alice, "Tools");
    const included = await s.save(s.alice, "design tools");
    const excluded = await s.save(s.alice, "design systems");
    const inbox = await s.save(s.alice, "design inspiration");
    await s.save(s.bob, "design secret");
    await s.attach(s.alice, included, labelId);
    await s.attach(s.alice, excluded, labelId);
    await s.alice.mutation(api.itemLabels.remove, {
      itemId: excluded,
      labelId,
    });
    await s.t.run((ctx) =>
      ctx.db.patch(included, { extractedText: "Saved design content" }),
    );
    for (const scope of [{}, { labelName: " TOOLS " }]) {
      const result = await s.callTool(s.alice, "mindspool_search_items", {
        query: "design",
        ...scope,
      });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent.exhaustive).toBe(false);
      const app =
        "labelName" in scope
          ? await s.alice.query(api.itemLabels.searchItemsForLabel, {
              labelId,
              query: "design",
              paginationOpts: { cursor: null, numItems: 10 },
            })
          : await s.alice.query(api.items.search, {
              query: "design",
              paginationOpts: { cursor: null, numItems: 10 },
            });
      expect(
        result.structuredContent.items.map((i: { itemId: string }) => i.itemId),
      ).toEqual(app.page.map((i) => i._id));
      expect(
        result.structuredContent.items.find(
          (i: { itemId: string }) => i.itemId === included,
        ).snippet,
      ).toBe("Saved design content");
      if (!("labelName" in scope))
        expect(
          result.structuredContent.items.map(
            (i: { itemId: string }) => i.itemId,
          ),
        ).toContain(inbox);
      else
        expect(
          result.structuredContent.items.map(
            (i: { itemId: string }) => i.itemId,
          ),
        ).toEqual([included]);
    }
  });

  it("validates query rules, label scope, filters, and cursor query binding", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) await s.save(s.alice, `design resource ${i}`);
    for (const query of [
      "",
      "   ",
      "x".repeat(201),
      Array(17).fill("word").join(" "),
    ]) {
      const result = await s.callTool(s.alice, "mindspool_search_items", {
        query,
      });
      expect(result.structuredContent.error.code).toBe("INVALID_INPUT");
    }
    const first = await s.callTool(s.alice, "mindspool_search_items", {
      query: "design",
    });
    expect(first.structuredContent.page.isDone).toBe(false);
    const wrong = await s.callTool(s.alice, "mindspool_search_items", {
      query: "resource",
      cursor: first.structuredContent.page.nextCursor,
    });
    expect(wrong.structuredContent.error.code).toBe("INVALID_INPUT");
    const foreign = await s.label(s.bob, "Private");
    expect(
      (
        await s.callTool(s.alice, "mindspool_search_items", {
          query: "design",
          labelId: foreign,
        })
      ).structuredContent.error.code,
    ).toBe("NOT_FOUND");
    expect(
      (
        await s.callTool(s.alice, "mindspool_search_items", {
          query: "design",
          labelId: foreign,
          labelName: "Private",
        })
      ).structuredContent.error.code,
    ).toBe("INVALID_INPUT");
    const filtered = await s.callTool(s.alice, "mindspool_search_items", {
      query: "design",
      source: "web",
    });
    expect(filtered.structuredContent.items).toEqual([]);
    const pages = await allPages(s, s.alice, "mindspool_search_items", {
      query: "design",
      limit: 4,
    });
    expect(pages.flatMap((p) => p.items)).toHaveLength(12);
    expect(pages.every((p) => p.exhaustive === false)).toBe(true);
  });
});

describe("mindspool_get_item", () => {
  it("returns saved detail, bounded input, safe images and deduplicated resource links", async () => {
    const s = await setup();
    const itemId = await s.save(s.alice, "https://example.com/original", "url");
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        originalInput: "x".repeat(4100),
        canonicalUrl: "https://www.example.com/original/?utm_source=test",
        enrichmentStatus: "succeeded",
        sourceMetadata: {
          title: "Title",
          description: "Description",
          author: "Author",
          siteName: "Site",
        },
        extractedText:
          "Read https://example.com/resource. Also https://example.com/resource/?utm_source=x and https://x.com/person/status/123 (https://example.org/a).",
        imageAssets: [
          {
            kind: "external",
            purpose: "image",
            url: "https://example.com/image.png",
          },
          { kind: "external", purpose: "image", url: "javascript:alert(1)" },
        ],
      }),
    );
    const labelId = await s.label(s.alice, "Reading");
    await s.attach(s.alice, itemId, labelId);
    const result = await s.callTool(s.alice, "mindspool_get_item", { itemId });
    expect(result.isError).toBeFalsy();
    const detail = result.structuredContent;
    expect(detail).toMatchObject({
      itemId,
      inputType: "url",
      captureSource: "web",
      enrichment: "succeeded",
      linkedPageRead: true,
      untrusted: true,
      metadata: { title: "Title", author: "Author" },
      userInput: { text: "x".repeat(4000), truncated: true },
      labels: [{ id: labelId, name: "Reading" }],
      labelsTruncated: false,
      linksTruncated: false,
      imageUrls: ["https://example.com/image.png"],
    });
    expect(detail.links).toEqual([
      { url: "https://example.com/original", role: "original" },
      { url: "https://example.com/resource", role: "in-content" },
      { url: "https://x.com/person/status/123", role: "in-content" },
      { url: "https://example.org/a", role: "in-content" },
    ]);
    expect(JSON.parse(result.content[0].text)).toEqual(detail);
  });

  it("reassembles long saved text exactly using content offsets", async () => {
    const s = await setup();
    const itemId = await s.save(s.alice, "Long note");
    const text = "abc\n😀".repeat(9000);
    await s.t.run((ctx) => ctx.db.patch(itemId, { extractedText: text }));
    let offset = 0;
    let assembled = "";
    for (let guard = 0; guard < 10; guard++) {
      const result = await s.callTool(s.alice, "mindspool_get_item", {
        itemId,
        contentOffset: offset,
      });
      expect(result.isError).toBeFalsy();
      const content = result.structuredContent.content;
      expect(content.offset).toBe(offset);
      expect(content.totalChars).toBe(text.length);
      expect(content.text.length).toBeLessThanOrEqual(20000);
      assembled += content.text;
      if (!content.truncated) {
        expect(content.nextOffset).toBeUndefined();
        break;
      }
      expect(content.nextOffset).toBe(offset + content.text.length);
      offset = content.nextOffset;
    }
    expect(assembled).toBe(text);
    const past = await s.callTool(s.alice, "mindspool_get_item", {
      itemId,
      contentOffset: text.length + 10,
    });
    expect(past.structuredContent.content).toEqual({
      text: "",
      offset: text.length + 10,
      totalChars: text.length,
      truncated: false,
    });
  });

  it("makes foreign, deleted and malformed ids indistinguishable", async () => {
    const s = await setup();
    const foreign = await s.save(s.bob, "Private content");
    const deleted = await s.save(s.alice, "Deleted content");
    await s.t.run((ctx) => ctx.db.delete(deleted));
    for (const itemId of [foreign, deleted, "not-an-id", ""]) {
      const result = await s.callTool(s.alice, "mindspool_get_item", {
        itemId,
      });
      expect(result.structuredContent.error).toEqual({
        code: "NOT_FOUND",
        message: "Not found",
        retryable: false,
      });
    }
  });

  it("flags label and link caps and never exposes excluded or foreign labels", async () => {
    const s = await setup();
    const itemId = await s.save(s.alice, "Many resources");
    for (let i = 0; i < 101; i++)
      await s.attach(s.alice, itemId, await s.label(s.alice, `Label ${i}`));
    const excluded = await s.label(s.alice, "Excluded");
    await s.attach(s.alice, itemId, excluded);
    await s.alice.mutation(api.itemLabels.remove, {
      itemId,
      labelId: excluded,
    });
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        extractedText: Array.from(
          { length: 51 },
          (_, i) => `https://example.com/${i}`,
        ).join("\n"),
      }),
    );
    const result = await s.callTool(s.alice, "mindspool_get_item", { itemId });
    expect(result.structuredContent.labels).toHaveLength(100);
    expect(result.structuredContent.labelsTruncated).toBe(true);
    expect(result.structuredContent.links).toHaveLength(50);
    expect(result.structuredContent.linksTruncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Excluded");
  });

  it.each(["not_started", "pending", "failed"] as const)(
    "does not claim the linked page was read for %s enrichment",
    async (enrichmentStatus) => {
      const s = await setup();
      const itemId = await s.save(s.alice, "Saved snippet");
      await s.t.run((ctx) =>
        ctx.db.patch(itemId, { enrichmentStatus, extractedText: "Some text" }),
      );
      expect(
        (await s.callTool(s.alice, "mindspool_get_item", { itemId }))
          .structuredContent.linkedPageRead,
      ).toBe(false);
    },
  );
});

describe("Reddit content stream", () => {
  it("reads the post then comments across windows without duplicating the saved projection", async () => {
    const s = await setup();
    const itemId = await s.save(s.alice, "Reddit capture");
    const post = "post ".repeat(4500);
    const comment = "comment ".repeat(3000);
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        extractedText: "Legacy projection must not be duplicated",
        redditCapture: {
          postId: "abc123",
          postText: post,
          comments: [
            {
              commentId: "def456",
              postId: "abc123",
              permalink: "https://www.reddit.com/comments/abc123/_/def456/",
              author: "Reader",
              text: comment,
              capturedAt: 1,
            },
          ],
        },
      }),
    );
    const expected = `Post\n\n${post}\n\nSelected comments\n\nReader\n${comment}\nhttps://www.reddit.com/comments/abc123/_/def456/`;
    let assembled = "";
    let offset = 0;
    let windows = 0;
    for (; windows < 10; windows++) {
      const result = await s.callTool(s.alice, "mindspool_get_item", {
        itemId,
        contentOffset: offset,
      });
      expect(result.isError).toBeFalsy();
      const content = result.structuredContent.content;
      expect(content.totalChars).toBe(expected.length);
      assembled += content.text;
      if (!content.truncated) break;
      offset = content.nextOffset;
    }
    expect(windows).toBeGreaterThanOrEqual(2);
    expect(assembled).toBe(expected);
    const browse = await s.callTool(s.alice, "mindspool_browse_items");
    expect(
      browse.structuredContent.items[0].snippet.length,
    ).toBeLessThanOrEqual(121);
    expect(JSON.stringify(browse)).not.toContain(comment);
  });
});

describe("discovery cursor normalization", () => {
  it("pages Unicode search queries and label names through the real handler", async () => {
    const s = await setup();
    const labelId = await s.label(s.alice, "Český 设计");
    for (let i = 0; i < 12; i++) {
      const itemId = await s.save(s.alice, `设计 resource ${i}`);
      await s.attach(s.alice, itemId, labelId);
    }
    for (const name of ["mindspool_browse_items", "mindspool_search_items"]) {
      const pages = await allPages(s, s.alice, name, {
        labelName: "český 设计",
        ...(name === "mindspool_search_items" ? { query: "设计" } : {}),
      });
      expect(pages.flatMap((page) => page.items)).toHaveLength(12);
    }
  });

  it("accepts a padded valid query without producing an unusably large cursor", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) await s.save(s.alice, `design ${i}`);
    const pages = await allPages(s, s.alice, "mindspool_search_items", {
      query: `${" ".repeat(3000)}design${" ".repeat(3000)}`,
    });
    expect(pages.flatMap((page) => page.items)).toHaveLength(12);
  });
});

describe("post resources", () => {
  it("navigates only owned post/link relationships and counts resources in summaries", async () => {
    const s = await setup();
    const post = await s.save(
      s.alice,
      "https://x.com/author/status/123",
      "url",
    );
    const link = await s.save(s.alice, "https://example.org/resource", "url");
    const foreign = await s.save(s.bob, "https://example.org/private", "url");
    await s.t.run(async (ctx) => {
      await ctx.db.patch(link, {
        fromItemId: post,
        extractedText: "Resource description",
      });
      await ctx.db.patch(foreign, { fromItemId: post });
      await ctx.db.patch(post, { linkedItemStats: { count: 1, revision: 0 } });
    });
    const detail = (
      await s.callTool(s.alice, "mindspool_get_item", { itemId: post })
    ).structuredContent;
    expect(detail.linkedItems).toEqual([
      {
        itemId: link,
        url: "https://example.org/resource",
        snippet: "Resource description",
        enrichment: "pending",
      },
    ]);
    const child = (
      await s.callTool(s.alice, "mindspool_get_item", { itemId: link })
    ).structuredContent;
    expect(child.fromPost).toMatchObject({
      itemId: post,
      url: "https://x.com/author/status/123",
    });
    const browse = (await s.callTool(s.alice, "mindspool_browse_items"))
      .structuredContent;
    expect(
      browse.items.find((i: { itemId: string }) => i.itemId === post)
        .linkedItemCount,
    ).toBe(1);
    expect(
      browse.items.find((i: { itemId: string }) => i.itemId === link)
        .linkedItemCount,
    ).toBeUndefined();
    await s.t.run((ctx) => ctx.db.delete(post));
    expect(
      (await s.callTool(s.alice, "mindspool_get_item", { itemId: link }))
        .structuredContent.fromPost,
    ).toBeUndefined();
  });

  it("bounds resource children at twenty and flags overflow", async () => {
    const s = await setup();
    const post = await s.save(s.alice, "Resource post");
    for (let i = 0; i < 21; i++) {
      const child = await s.save(s.alice, `https://example.org/${i}`, "url");
      await s.t.run((ctx) => ctx.db.patch(child, { fromItemId: post }));
    }
    await s.t.run((ctx) =>
      ctx.db.patch(post, { linkedItemStats: { count: 21, revision: 0 } }),
    );
    const result = (
      await s.callTool(s.alice, "mindspool_get_item", { itemId: post })
    ).structuredContent;
    expect(result.linkedItems).toHaveLength(20);
    expect(result.linkedItemsTruncated).toBe(true);
  });
});

it("serves a ten-post page with twenty resources each within the read budget", async () => {
  const s = await setup();
  const labelId = await s.label(s.alice, "Resource posts");
  for (let postIndex = 0; postIndex < 10; postIndex++) {
    const post = await s.save(s.alice, `Post ${postIndex}`);
    await s.attach(s.alice, post, labelId);
    for (let i = 0; i < 20; i++) {
      const child = await s.save(
        s.alice,
        `https://example.org/${postIndex}/${i}`,
        "url",
      );
      await s.t.run((ctx) =>
        ctx.db.patch(child, {
          fromItemId: post,
          extractedText: "resource ".repeat(5000),
        }),
      );
    }
  }
  const { ownerId } = await s.alice.query(api.identity.current, {});
  await s.t.run(async (ctx) => {
    for (const post of await ctx.db
      .query("items")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(211))
      if (!post.fromItemId)
        await ctx.db.patch(post._id, {
          linkedItemStats: { count: 20, revision: 0 },
        });
  });
  const result = await s.callTool(s.alice, "mindspool_browse_items", {
    labelId,
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent.items).toHaveLength(10);
  expect(
    result.structuredContent.items.every(
      (item: { linkedItemCount: number }) => item.linkedItemCount === 20,
    ),
  ).toBe(true);
  const { getDocumentSize } = await import("convex/values");
  const previews = await s.alice.query(api.itemLabels.listItemsForLabel, {
    labelId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  let bytes = 0;
  await s.t.run(async (ctx) => {
    const db = new Proxy(ctx.db, {
      get(target, key) {
        if (key === "query")
          throw new Error("Summary counts must not hydrate child rows");
        if (key === "get")
          return async (...args: unknown[]) => {
            const value = await Reflect.apply(target.get, target, args);
            if (value) bytes += getDocumentSize(value);
            return value;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await withSnippets({ ...ctx, db }, previews.page, ownerId);
  });
  expect(bytes).toBeLessThan(1024 * 1024);
});

it("returns a bounded retryable error for an oversized label page without silently skipping labels", async () => {
  const s = await setup();
  for (let i = 0; i < 50; i++)
    await s.label(s.alice, `Label ${i}`, "😀".repeat(250));
  const large = await s.callTool(s.alice, "mindspool_list_labels");
  expect(large.isError).toBe(true);
  expect(large.structuredContent.error.code).toBe("UNAVAILABLE");
  const pages = await allPages(s, s.alice, "mindspool_list_labels", {
    limit: 10,
  });
  expect(pages.flatMap((page) => page.labels)).toHaveLength(50);
  for (const page of pages)
    expect(
      new TextEncoder().encode(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(page) }],
          structuredContent: page,
        }),
      ).byteLength,
    ).toBeLessThanOrEqual(65536);
});

it("keeps owner selection out of every public function's argument schema", async () => {
  const loaded = await Promise.all(
    Object.values(modules).map((load) => load()),
  );
  let inspected = 0;
  for (const module of loaded)
    for (const exported of Object.values(module as Record<string, unknown>)) {
      if (
        typeof exported === "function" &&
        "isPublic" in exported &&
        exported.isPublic === true &&
        "exportArgs" in exported &&
        typeof exported.exportArgs === "function"
      ) {
        const validator = JSON.parse(exported.exportArgs());
        expect(validator.value).not.toHaveProperty("ownerId");
        inspected++;
      }
    }
  expect(inspected).toBeGreaterThan(20);
});

type SummaryRow = { itemId: string } & Record<string, any>;
const ids = (page: { items: SummaryRow[] }) => page.items.map((i) => i.itemId);
const failure = (result: { structuredContent: any }) =>
  result.structuredContent.error;

describe("compact browse and search", () => {
  it("enumerates exactly the standard selection and order in a smaller shape", async () => {
    const s = await setup();
    const labelId = await s.label(s.alice, "Reading");
    for (let i = 0; i < 25; i++)
      await s.attach(s.alice, await s.save(s.alice, `Clip ${i}`), labelId);
    for (const scope of [{ labelId }, {}]) {
      const standard = await allPages(
        s,
        s.alice,
        "mindspool_browse_items",
        scope,
      );
      const compact = await allPages(s, s.alice, "mindspool_browse_items", {
        ...scope,
        format: "compact",
      });
      expect(compact.map(ids)).toEqual(standard.map(ids));
      expect(compact.map((p) => p.page.returned)).toEqual(
        standard.map((p) => p.page.returned),
      );
      for (const page of compact) {
        expect(page.format).toBe("compact");
        expect(page.untrusted).toBe(true);
        for (const item of page.items)
          for (const absent of [
            "preview",
            "snippet",
            "savedAt",
            "inputType",
            "labels",
            "labelCount",
          ])
            expect(item).not.toHaveProperty(absent);
      }
    }
  });

  it("keeps standard output unchanged for omitted or explicit standard format", async () => {
    const s = await setup();
    await s.save(s.alice, "A note");
    const omitted = await s.callTool(s.alice, "mindspool_browse_items");
    const explicit = await s.callTool(s.alice, "mindspool_browse_items", {
      format: "standard",
    });
    expect(explicit.structuredContent).toEqual(omitted.structuredContent);
    expect(omitted.structuredContent).not.toHaveProperty("format");
    expect(omitted.structuredContent.items[0]).toHaveProperty("savedAt");
  });

  it("rejects includeLabels with standard format, even when false", async () => {
    const s = await setup();
    for (const args of [
      { includeLabels: false },
      { includeLabels: true, format: "standard" },
    ]) {
      const result = await s.callTool(s.alice, "mindspool_browse_items", args);
      expect(result.isError).toBe(true);
      expect(failure(result).code).toBe("INVALID_INPUT");
    }
  });

  it("binds cursors to the representation", async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) await s.save(s.alice, `Clip ${i}`);
    const standard = await s.callTool(s.alice, "mindspool_browse_items", {
      limit: 5,
    });
    const compact = await s.callTool(s.alice, "mindspool_browse_items", {
      limit: 5,
      format: "compact",
    });
    const withLabels = await s.callTool(s.alice, "mindspool_browse_items", {
      limit: 5,
      format: "compact",
      includeLabels: true,
    });
    const cursors = [standard, compact, withLabels].map(
      (r) => r.structuredContent.page.nextCursor,
    );
    expect(new Set(cursors).size).toBe(3);
    const crossed = await s.callTool(s.alice, "mindspool_browse_items", {
      limit: 5,
      format: "compact",
      cursor: cursors[0],
    });
    expect(failure(crossed).code).toBe("INVALID_INPUT");
    const reused = await s.callTool(s.alice, "mindspool_browse_items", {
      limit: 5,
      format: "compact",
      includeLabels: true,
      cursor: cursors[1],
    });
    expect(failure(reused).code).toBe("INVALID_INPUT");
    const ok = await s.callTool(s.alice, "mindspool_browse_items", {
      limit: 5,
      format: "compact",
      cursor: cursors[1],
    });
    expect(ok.isError).toBeFalsy();
  });

  it("reports suggestion for the requested label itself, beyond a three-label sample", async () => {
    const s = await setup();
    const target = await s.label(s.alice, "Target");
    const itemId = await s.save(s.alice, "Suggested here");
    // Four other labels first, so a sample of three never reaches the target.
    for (const name of ["a", "b", "c", "d"])
      await s.attach(s.alice, itemId, await s.label(s.alice, name));
    const runId = await s.t.mutation(internal.processingRuns.start, {
      itemId,
      kind: "decision",
      provider: "clef-flash",
      model: "clef-flash",
      modality: "text",
      questionVersion: "v1",
    });
    await s.t.mutation(internal.decisions.complete, {
      runId,
      itemId,
      suggestions: [{ labelId: target, confidence: 0.55 }],
      model: "clef-flash",
    });
    const scoped = await s.callTool(s.alice, "mindspool_browse_items", {
      labelId: target,
      format: "compact",
      includeLabels: true,
    });
    const [row] = scoped.structuredContent.items;
    expect(scoped.structuredContent.label).toEqual({
      id: target,
      name: "Target",
    });
    expect(row.suggested).toBe(true);
    expect(row).not.toHaveProperty("needsReview");
    // The requested label is page-level; four others overflow the three allowed.
    expect(row.labels).toHaveLength(3);
    expect(row.labels.map((l: { id: string }) => l.id)).not.toContain(target);
    expect(row.labelsTruncated).toBe(true);

    const library = await s.callTool(s.alice, "mindspool_browse_items", {
      format: "compact",
    });
    const [whole] = library.structuredContent.items;
    expect(whole.needsReview).toBe(true);
    expect(whole).not.toHaveProperty("suggested");
    expect(whole).not.toHaveProperty("labels");
  });

  it("shows a browse excerpt, flags truncation, and keeps unique input discoverable", async () => {
    const s = await setup();
    const longId = await s.save(s.alice, "My commentary on this");
    const urlOnly = await s.save(s.alice, "https://example.com/a", "url");
    await s.t.run(async (ctx) => {
      await ctx.db.patch(longId, {
        extractedText: `  ${"word ".repeat(80)}`,
      });
      await ctx.db.patch(urlOnly, { originalUrl: "https://example.com/a" });
    });
    const page = (
      await s.callTool(s.alice, "mindspool_browse_items", {
        format: "compact",
      })
    ).structuredContent;
    const byId = Object.fromEntries(
      page.items.map((i: SummaryRow) => [i.itemId, i]),
    );
    expect(byId[longId].excerpt.source).toBe("content");
    expect(byId[longId].excerpt.text).toHaveLength(159);
    expect(byId[longId].excerpt.truncated).toBe(true);
    expect(byId[longId].hasDistinctUserInput).toBe(true);
    expect(byId[urlOnly].url).toBe("https://example.com/a");
    expect(byId[urlOnly]).not.toHaveProperty("excerpt");
  });

  it("centres search excerpts on a deep match without changing ranking", async () => {
    const s = await setup();
    const deep = await s.save(s.alice, "Plain needle note");
    const other = await s.save(s.alice, "needle appears in the note itself");
    await s.t.run((ctx) =>
      ctx.db.patch(deep, {
        extractedText: `${"lorem ipsum ".repeat(30)}needle in the haystack ${"dolor ".repeat(30)}`,
      }),
    );
    const standard = await s.callTool(s.alice, "mindspool_search_items", {
      query: "needle",
    });
    const compact = await s.callTool(s.alice, "mindspool_search_items", {
      query: "needle",
      format: "compact",
    });
    expect(ids(compact.structuredContent)).toEqual(
      ids(standard.structuredContent),
    );
    expect(compact.structuredContent.exhaustive).toBe(false);
    const byId = Object.fromEntries(
      compact.structuredContent.items.map((i: SummaryRow) => [i.itemId, i]),
    );
    expect(byId[deep].excerpt.text).toContain("needle");
    expect(byId[deep].excerpt.source).toBe("content");
    expect(byId[deep].excerpt.truncated).toBe(true);
    // No saved content: the matching passage is in the user's own input.
    expect(byId[other].excerpt).toMatchObject({
      source: "userInput",
      text: "needle appears in the note itself",
    });
  });

  it("falls back to the browse excerpt when the index matches but no literal text does", async () => {
    const s = await setup();
    const itemId = await s.save(s.alice, "Running notes");
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, { extractedText: "Alphabet soup recipe" }),
    );
    // Stemming matches "runs" to "Running" in the index only.
    const result = await s.callTool(s.alice, "mindspool_search_items", {
      query: "runs",
      format: "compact",
    });
    expect(result.isError).toBeFalsy();
    for (const item of result.structuredContent.items)
      if (item.excerpt) expect(item.excerpt.text).not.toMatch(/…/);
  });
});

describe("efficient mindspool_get_item", () => {
  const long = "abc\n😀".repeat(9000);

  async function fixture() {
    const s = await setup();
    const itemId = await s.save(s.alice, "u".repeat(6000));
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        extractedText: long,
        enrichmentStatus: "succeeded",
        canonicalUrl: "https://example.com/a",
        originalUrl: "https://example.com/a",
        sourceMetadata: { title: "Title", description: "d".repeat(500) },
      }),
    );
    const labelId = await s.label(s.alice, "Reading");
    await s.attach(s.alice, itemId, labelId);
    const read = (args: Record<string, unknown>) =>
      s.callTool(s.alice, "mindspool_get_item", { itemId, ...args });
    return { s, itemId, labelId, read };
  }

  async function readAll(
    read: ReturnType<typeof fixture> extends Promise<infer F>
      ? F extends { read: infer R }
        ? R
        : never
      : never,
    stream: "content" | "userInput",
    mode: "excerpt" | "full",
    maxChars?: number,
  ) {
    let offset = 0;
    let version: string | undefined;
    let text = "";
    const keys: string[][] = [];
    for (let guard = 0; guard < 200; guard++) {
      const result = await read({
        mode,
        stream,
        offset,
        ...(maxChars ? { maxChars } : {}),
        ...(version ? { version } : {}),
      });
      expect(result.isError).toBeFalsy();
      const body = result.structuredContent;
      keys.push(Object.keys(body).sort());
      expect(body.content.offset).toBe(offset);
      version = body.content.version;
      text += body.content.text;
      if (!body.content.truncated) return { text, keys };
      expect(body.content.nextOffset).toBe(offset + body.content.text.length);
      offset = body.content.nextOffset;
    }
    throw new Error("did not finish");
  }

  it("returns metadata and stream sizes without any text", async () => {
    const { itemId, labelId, read } = await fixture();
    const result = await read({ mode: "metadata" });
    expect(result.isError).toBeFalsy();
    const body = result.structuredContent;
    expect(body).not.toHaveProperty("content");
    expect(body).not.toHaveProperty("resources");
    expect(body.itemId).toBe(itemId);
    expect(body.context).toMatchObject({
      enrichment: "succeeded",
      linkedPageRead: true,
      url: "https://example.com/a",
      metadata: { title: "Title" },
      labels: [{ id: labelId, name: "Reading" }],
      labelsTruncated: false,
    });
    // Equal canonical URL is not repeated.
    expect(body.context).not.toHaveProperty("canonicalUrl");
    expect(body.streams.content.totalChars).toBe(long.length);
    expect(body.streams.userInput.totalChars).toBe(6000);
    expect(body.streams.userInput.relation).toBe("distinct");
    expect(JSON.stringify(body)).not.toContain("uuuu");
  });

  it("limits excerpts to 2,000 by default and 4,000 at most", async () => {
    const { read } = await fixture();
    const excerpt = await read({ mode: "excerpt" });
    expect(excerpt.structuredContent.content.text).toHaveLength(2000);
    expect(excerpt.structuredContent.content.truncated).toBe(true);
    const wide = await read({ mode: "excerpt", maxChars: 4000 });
    expect(wide.structuredContent.content.text).toHaveLength(4000);
    const tooWide = await read({ mode: "excerpt", maxChars: 4001 });
    expect(failure(tooWide).code).toBe("INVALID_INPUT");
  });

  it("reassembles both streams exactly, with bare continuations", async () => {
    const { read } = await fixture();
    const content = await readAll(read, "content", "full");
    expect(content.text).toBe(long);
    for (const keys of content.keys.slice(1))
      expect(keys).toEqual([
        "content",
        "itemId",
        "mode",
        "stream",
        "untrusted",
      ]);
    expect(content.keys[0]).toEqual(
      expect.arrayContaining(["context", "streams"]),
    );
    // Whole original input, beyond the legacy 4,000-character cap.
    expect((await readAll(read, "userInput", "excerpt", 4000)).text).toBe(
      "u".repeat(6000),
    );
  });

  it("switches from an excerpt to full at nextOffset with the same version", async () => {
    const { read } = await fixture();
    const first = (await read({ mode: "excerpt" })).structuredContent.content;
    const rest = await read({
      mode: "full",
      offset: first.nextOffset,
      version: first.version,
    });
    expect(first.text + rest.structuredContent.content.text).toBe(
      long.slice(
        0,
        first.text.length + rest.structuredContent.content.text.length,
      ),
    );
    expect(rest.structuredContent.content.offset).toBe(first.nextOffset);
  });

  it("detects changed text and wrong-stream or malformed versions", async () => {
    const { s, itemId, read } = await fixture();
    const first = (await read({ mode: "excerpt" })).structuredContent;
    const version = first.content.version;
    const userVersion = first.streams.userInput.version;
    const wrong = await read({
      mode: "excerpt",
      stream: "userInput",
      offset: 5,
      version,
    });
    expect(failure(wrong)).toMatchObject({
      code: "CONFLICT",
      retryable: false,
    });
    expect(
      (
        await read({
          mode: "excerpt",
          stream: "userInput",
          offset: 5,
          version: userVersion,
        })
      ).isError,
    ).toBeFalsy();
    expect(
      failure(await read({ mode: "excerpt", offset: 5, version: "nope" })).code,
    ).toBe("INVALID_INPUT");
    // Unrelated label changes do not invalidate; a text change does.
    await s.attach(s.alice, itemId, await s.label(s.alice, "Other"));
    expect(
      (await read({ mode: "excerpt", offset: 4, version })).isError,
    ).toBeFalsy();
    await s.t.run((ctx) => ctx.db.patch(itemId, { extractedText: `${long}!` }));
    expect(
      failure(await read({ mode: "excerpt", offset: 4, version })).code,
    ).toBe("CONFLICT");
    // Version at offset zero is optional but validated when given.
    expect(failure(await read({ mode: "excerpt", version })).code).toBe(
      "CONFLICT",
    );
  });

  it("enforces offsets, pairs and invalid parameter combinations", async () => {
    const { s, itemId, read } = await fixture();
    const version = (await read({ mode: "metadata" })).structuredContent.streams
      .content.version;
    const bad = async (args: Record<string, unknown>) =>
      failure(await read(args)).code;
    expect(await bad({ mode: "excerpt", offset: 5 })).toBe("INVALID_INPUT");
    expect(
      await bad({ mode: "excerpt", offset: long.length + 1, version }),
    ).toBe("INVALID_INPUT");
    // "abc\n😀": index 5 is the low half of the first pair.
    expect(await bad({ mode: "excerpt", offset: 5, version })).toBe(
      "INVALID_INPUT",
    );
    expect(
      await bad({ mode: "excerpt", offset: 4, maxChars: 1, version }),
    ).toBe("INVALID_INPUT");
    expect(await bad({ stream: "content" })).toBe("INVALID_INPUT");
    expect(await bad({ offset: 0 })).toBe("INVALID_INPUT");
    expect(await bad({ mode: "full", contentOffset: 0 })).toBe("INVALID_INPUT");
    expect(await bad({ mode: "metadata", offset: 0 })).toBe("INVALID_INPUT");
    expect(await bad({ mode: "metadata", includeContext: false })).toBe(
      "INVALID_INPUT",
    );
    expect((await read({ mode: "full", maxChars: 20001 })).isError).toBe(true);
    const end = await read({ mode: "full", offset: long.length, version });
    expect(end.structuredContent.content).toMatchObject({
      text: "",
      truncated: false,
      offset: long.length,
    });
    expect(end.structuredContent.content).not.toHaveProperty("nextOffset");
    // Windows never split a pair: a 2-unit limit at a pair returns the pair.
    const pair = await read({ mode: "full", offset: 4, maxChars: 2, version });
    expect(pair.structuredContent.content.text).toBe("😀");
    void s;
    void itemId;
  });

  it("returns resources only on request and keeps them independent of stream", async () => {
    const { s, itemId, read } = await fixture();
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        extractedText: "See https://example.com/resource for more",
      }),
    );
    const plain = (await read({ mode: "excerpt" })).structuredContent;
    expect(plain).not.toHaveProperty("resources");
    const withResources = (
      await read({
        mode: "excerpt",
        stream: "userInput",
        includeResources: true,
      })
    ).structuredContent;
    expect(withResources.resources.links).toContainEqual({
      url: "https://example.com/resource",
      role: "in-content",
    });
  });

  it("asks the backend for nothing beyond the item on bare continuations", async () => {
    const { s, itemId } = await fixture();
    const calls: Record<string, unknown>[] = [];
    const overrides = {
      runQuery: ((query: unknown, args: Record<string, unknown>) => {
        calls.push(args);
        return s.t.query(query as never, ...([args] as never));
      }) as McpServices["runQuery"],
    };
    const first = await s.callTool(
      s.alice,
      "mindspool_get_item",
      { itemId, mode: "excerpt" },
      overrides,
    );
    const { nextOffset, version } = first.structuredContent.content;
    await s.callTool(
      s.alice,
      "mindspool_get_item",
      { itemId, mode: "excerpt", offset: nextOffset, version },
      overrides,
    );
    expect(calls[0]).toMatchObject({ context: true, resources: false });
    expect(calls[1]).toMatchObject({ context: false, resources: false });
  });

  it("makes foreign and malformed ids indistinguishable and keeps legacy reads working", async () => {
    const { s, itemId } = await fixture();
    const foreign = await s.save(s.bob, "Private");
    for (const id of [foreign, "garbage"]) {
      const result = await s.callTool(s.alice, "mindspool_get_item", {
        itemId: id,
        mode: "metadata",
      });
      expect(failure(result)).toMatchObject({ code: "NOT_FOUND" });
    }
    const legacy = await s.callTool(s.alice, "mindspool_get_item", { itemId });
    expect(legacy.structuredContent.userInput.truncated).toBe(true);
    expect(legacy.structuredContent).not.toHaveProperty("mode");
  });

  it("fits oversized context within the budget and flags the clipping", async () => {
    const { s, itemId, read } = await fixture();
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        sourceMetadata: { title: "T", description: "\u0001".repeat(20000) },
      }),
    );
    const result = await read({ mode: "metadata" });
    expect(result.isError).toBeFalsy();
    expect(
      new TextEncoder().encode(JSON.stringify(result.structuredContent)).length,
    ).toBeLessThan(64 * 1024);
  });
});

// Synthetic fixtures only: no private clips. Numbers are printed so the
// verification record can quote them; the assertions are the spec's gates.
describe("efficiency gates (synthetic fixtures)", () => {
  const bytes = (result: { structuredContent: unknown }) =>
    toolBytes(result.structuredContent);

  async function ordinaryPage() {
    const s = await setup();
    const labels = await Promise.all(
      ["Design", "Reading", "Later"].map((name) => s.label(s.alice, name)),
    );
    for (let i = 0; i < 10; i++) {
      const itemId = await s.save(
        s.alice,
        `https://example.com/articles/synthetic-article-number-${i}?ref=fixture-${i}`,
        "url",
      );
      await s.t.run((ctx) =>
        ctx.db.patch(itemId, {
          originalUrl: `https://example.com/articles/synthetic-article-number-${i}`,
          enrichmentStatus: "succeeded",
          sourceMetadata: { title: `Synthetic article number ${i}` },
          extractedText: `Article ${i}. ${"Synthetic body sentence about design systems. ".repeat(8)}`,
        }),
      );
      for (const labelId of labels) await s.attach(s.alice, itemId, labelId);
    }
    return s;
  }

  it("compact browse and search cut ten-row pages by at least 25% with the same items", async () => {
    const s = await ordinaryPage();
    for (const [tool, extra] of [
      ["mindspool_browse_items", {}],
      ["mindspool_search_items", { query: "design" }],
    ] as const) {
      const standard = await s.callTool(s.alice, tool, extra);
      const compact = await s.callTool(s.alice, tool, {
        ...extra,
        format: "compact",
      });
      expect(ids(compact.structuredContent)).toEqual(
        ids(standard.structuredContent),
      );
      expect(compact.structuredContent.items).toHaveLength(10);
      const saved = 1 - bytes(compact) / bytes(standard);
      console.log(
        `${tool}: standard ${bytes(standard)} B, compact ${bytes(compact)} B, saved ${(saved * 100).toFixed(1)}%`,
      );
      expect(saved).toBeGreaterThanOrEqual(0.25);
    }
  });

  async function heavyItem() {
    const s = await setup();
    const itemId = await s.save(s.alice, "c".repeat(4000));
    await s.t.run((ctx) =>
      ctx.db.patch(itemId, {
        originalUrl: "https://example.com/long-form",
        canonicalUrl: "https://example.com/long-form",
        enrichmentStatus: "succeeded",
        sourceMetadata: {
          title: "Synthetic long form",
          description: "Synthetic description. ".repeat(40),
          author: "Synthetic Author",
          siteName: "Synthetic Site",
        },
        extractedText: "Long synthetic paragraph about systems. ".repeat(2000),
        imageAssets: [1, 2, 3, 4, 5].map((n) => ({
          kind: "external" as const,
          purpose: "image" as const,
          url: `https://example.com/images/synthetic-${n}.png`,
        })),
      }),
    );
    for (const name of ["Design", "Reading", "Later", "Systems"])
      await s.attach(s.alice, itemId, await s.label(s.alice, name));
    return { s, itemId };
  }

  it("continuations carry at least 75% less overhead than legacy", async () => {
    const { s, itemId } = await heavyItem();
    const overhead = (result: { structuredContent: any }) => {
      const body = structuredClone(result.structuredContent);
      body.content.text = "";
      return toolBytes(body);
    };
    const legacy = await s.callTool(s.alice, "mindspool_get_item", {
      itemId,
      contentOffset: 20000,
    });
    const first = await s.callTool(s.alice, "mindspool_get_item", {
      itemId,
      mode: "full",
    });
    const next = await s.callTool(s.alice, "mindspool_get_item", {
      itemId,
      mode: "full",
      offset: first.structuredContent.content.nextOffset,
      version: first.structuredContent.content.version,
    });
    const saved = 1 - overhead(next) / overhead(legacy);
    console.log(
      `continuation overhead: legacy ${overhead(legacy)} B, efficient ${overhead(next)} B, saved ${(saved * 100).toFixed(1)}%`,
    );
    expect(saved).toBeGreaterThanOrEqual(0.75);
  });

  it("a complete full read uses no more calls or bytes than legacy and rebuilds identical text", async () => {
    const { s, itemId } = await heavyItem();
    const text = "Long synthetic paragraph about systems. ".repeat(2000);
    const run = async (efficient: boolean) => {
      let total = 0;
      let calls = 0;
      let offset = 0;
      let version: string | undefined;
      let assembled = "";
      for (let guard = 0; guard < 20; guard++) {
        const result = await s.callTool(s.alice, "mindspool_get_item", {
          itemId,
          ...(efficient
            ? { mode: "full", offset, ...(version ? { version } : {}) }
            : { contentOffset: offset }),
        });
        expect(result.isError).toBeFalsy();
        calls++;
        total += bytes(result);
        const content = result.structuredContent.content;
        version = content.version;
        assembled += content.text;
        if (!content.truncated) break;
        offset = content.nextOffset;
      }
      return { calls, total, assembled };
    };
    const legacy = await run(false);
    const efficient = await run(true);
    console.log(
      `full read: legacy ${legacy.calls} calls ${legacy.total} B, efficient ${efficient.calls} calls ${efficient.total} B`,
    );
    expect(efficient.assembled).toBe(text);
    expect(legacy.assembled).toBe(text);
    expect(efficient.calls).toBeLessThanOrEqual(legacy.calls);
    expect(efficient.total).toBeLessThanOrEqual(legacy.total);
  });
});

it("rejects hidden IDs through legacy and efficient MCP reads while retaining resource context", async () => {
  const { t, alice, bob, save, label, attach, callTool } = await setup();
  const source = await save(alice, "hidden source snapshot");
  const resource = await save(alice, "visible resource");
  const labelId = await label(alice, "Source-only label");
  await attach(alice, source, labelId);
  const { ownerId } = await alice.query(api.identity.current, {});
  await t.run(async (ctx) => {
    await ctx.db.patch(source, { libraryRole: "tweet_source" });
    await ctx.db.patch(resource, { fromItemId: source });
  });
  await expect(
    t.query(internal.mcpDiscovery.getItem, { ownerId, itemId: source }),
  ).rejects.toThrow("Not found");
  await expect(
    t.query(internal.mcpDiscovery.readItem, {
      ownerId,
      itemId: source,
      context: true,
      resources: true,
    }),
  ).rejects.toThrow("Not found");
  for (const mode of [undefined, "metadata", "excerpt", "full"]) {
    expect(
      (
        await callTool(alice, "mindspool_get_item", {
          itemId: source,
          ...(mode ? { mode } : {}),
        })
      ).isError,
    ).toBe(true);
  }
  const detail = await t.query(internal.mcpDiscovery.readItem, {
    ownerId,
    itemId: resource,
    context: true,
    resources: true,
  });
  expect(detail.fromPost?._id).toBe(source);
  expect(
    (await callTool(bob, "mindspool_get_item", { itemId: resource })).isError,
  ).toBe(true);
  const labels = await t.query(internal.mcpDiscovery.listLabels, {
    ownerId,
    cursor: null,
    limit: 20,
  });
  expect(labels.labels.find((row) => row._id === labelId)?.hasItems).toBe(
    false,
  );
});
