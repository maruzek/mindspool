import { describe, expect, it } from "vitest";
import { fakeFetch, fixture } from "./fixtures";
import {
  fromFxTwitter,
  fromSyndication,
  resolvePost,
  syndicationToken,
} from "./resolvePost";

const cases = [
  {
    name: "text",
    ref: { id: "2108980679396515996", handle: "nytimes" },
    author: "The New York Times",
    images: [],
  },
  {
    name: "photo",
    ref: { id: "2108662426606395572", handle: "NASA" },
    author: "NASA",
    images: ["https://pbs.twimg.com/media/HUN5TRIXQAAuu31.jpg?name=large"],
  },
  {
    name: "multi-photo",
    ref: { id: "2107854303809667285", handle: "NASADepAdmin" },
    author: "Deputy Administrator Matt Anderson",
    images: [
      "https://pbs.twimg.com/media/HUCaTwMaMAAwDCq.jpg?name=large",
      "https://pbs.twimg.com/media/HUCaTwIaMAALGER.jpg?name=large",
      "https://pbs.twimg.com/media/HUCaTwIbUAE6Dbu.jpg?name=large",
      "https://pbs.twimg.com/media/HUCaTwJa0AAOOCd.jpg?name=large",
    ],
  },
  {
    name: "video",
    ref: { id: "2108950762994741523", handle: "NASASpox" },
    author: "NASA Spox",
    images: ["https://pbs.twimg.com/media/HUR_QhjWMAA-7Mn.jpg?name=large"],
  },
  {
    name: "quote",
    ref: { id: "2107520267417190819", handle: "NASAWebb" },
    author: "NASA Webb Telescope",
    images: [],
  },
];

describe("fromFxTwitter", () => {
  it.each(cases)(
    "maps the $name post",
    async ({ name, ref, author, images }) => {
      const post = await fromFxTwitter(ref, {
        fetch: fakeFetch({ fx: [200, `fx-${name}.json`] }),
      });
      const tweet = JSON.parse(fixture(`fx-${name}.json`)).tweet;
      expect(post).toEqual({
        id: ref.id,
        handle: ref.handle,
        author,
        text: tweet.text.trim(),
        images,
      });
    },
  );

  it("uses only the outer post of a quote", async () => {
    const post = await fromFxTwitter(cases[4]!.ref, {
      fetch: fakeFetch({ fx: [200, "fx-quote.json"] }),
    });
    const quote = JSON.parse(fixture("fx-quote.json")).tweet.quote;
    expect(post?.text).not.toContain(quote.text);
    expect(post?.images).toEqual([]);
  });

  it("returns the full text of long posts", async () => {
    const post = await fromFxTwitter(
      { id: "2108914690843718125", handle: "TheAthletic" },
      { fetch: fakeFetch({ fx: [200, "fx-long.json"] }) },
    );
    expect(post?.text.length).toBe(388);
  });

  it("keeps the photo of a long post", async () => {
    const post = await fromFxTwitter(
      { id: "2108634020414095601", handle: "NASASpaceOps" },
      { fetch: fakeFetch({ fx: [200, "fx-long-photo.json"] }) },
    );
    expect(post?.text.length).toBeGreaterThan(300);
    expect(post?.images).toEqual([
      "https://pbs.twimg.com/media/HUNfVcHWwAE6liy.jpg?name=large",
    ]);
  });

  it.each([
    [404, "fx-missing-404.json"],
    [401, "fx-protected-401.json"],
    [429, "fx-rate-limited-429.json"],
    [200, "fx-malformed.json"],
    [200, "fx-deleted-200.html"],
  ] as const)("returns null for %s %s", async (status, file) => {
    const post = await fromFxTwitter(
      { id: "20", handle: "jack" },
      { fetch: fakeFetch({ fx: [status, file] }) },
    );
    expect(post).toBeNull();
  });

  it("returns null when the network fails", async () => {
    expect(
      await fromFxTwitter(
        { id: "20", handle: "jack" },
        { fetch: fakeFetch({}) },
      ),
    ).toBeNull();
  });

  it("returns null for a post with another id", async () => {
    const post = await fromFxTwitter(
      { id: "1", handle: "NASA" },
      { fetch: fakeFetch({ fx: [200, "fx-photo.json"] }) },
    );
    expect(post).toBeNull();
  });

  it("gives up after the timeout", async () => {
    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("x"))),
      )) as unknown as typeof fetch;
    expect(
      await fromFxTwitter(
        { id: "20", handle: "jack" },
        { fetch: hanging, timeoutMs: 10 },
      ),
    ).toBeNull();
  });

  it("caps images at ten and drops non-https and duplicates", async () => {
    const photos = [
      ...Array.from({ length: 12 }, (_, i) => ({
        url: `https://pbs.twimg.com/media/${i}.jpg?name=orig`,
      })),
      { url: "https://pbs.twimg.com/media/0.jpg" },
      { url: "http://pbs.twimg.com/media/http.jpg" },
    ];
    const body = {
      code: 200,
      tweet: {
        id: "5",
        text: "x",
        author: { screen_name: "a", name: "A" },
        media: { photos },
      },
    };
    const post = await fromFxTwitter(
      { id: "5", handle: "a" },
      {
        fetch: (async () =>
          new Response(JSON.stringify(body))) as unknown as typeof fetch,
      },
    );
    expect(post?.images).toHaveLength(10);
    expect(new Set(post?.images).size).toBe(10);
  });
});

describe("fromSyndication", () => {
  it.each(cases)(
    "maps the $name post",
    async ({ name, ref, author, images }) => {
      const post = await fromSyndication(ref, {
        fetch: fakeFetch({ syn: [200, `syn-${name}.json`] }),
      });
      expect(post).toMatchObject({
        id: ref.id,
        handle: ref.handle,
        author,
        images,
      });
    },
  );

  it("matches FxTwitter text for posts without long text", async () => {
    for (const { name, ref } of cases.filter((c) => c.name !== "quote")) {
      const fx = await fromFxTwitter(ref, {
        fetch: fakeFetch({ fx: [200, `fx-${name}.json`] }),
      });
      const syn = await fromSyndication(ref, {
        fetch: fakeFetch({ syn: [200, `syn-${name}.json`] }),
      });
      expect(syn?.text).toBe(fx?.text);
    }
  });

  it("cuts the media link and expands short links", async () => {
    const post = await fromSyndication(cases[1]!.ref, {
      fetch: fakeFetch({ syn: [200, "syn-photo.json"] }),
    });
    expect(post?.text).not.toContain("t.co");
    const text = await fromSyndication(cases[0]!.ref, {
      fetch: fakeFetch({ syn: [200, "syn-text.json"] }),
    });
    expect(text?.text).toContain("https://nyti.ms/3TAzDWp");
    expect(text?.text).not.toContain("t.co");
  });

  it("truncates long posts (known limit of syndication)", async () => {
    const post = await fromSyndication(
      { id: "2108914690843718125", handle: "TheAthletic" },
      { fetch: fakeFetch({ syn: [200, "syn-long.json"] }) },
    );
    expect(post?.text.length).toBeLessThan(388);
  });

  it("requests the computed token", async () => {
    const fetch = fakeFetch({ syn: [200, "syn-text.json"] });
    await fromSyndication(cases[0]!.ref, { fetch });
    expect(fetch.calls[0]).toContain(
      `token=${syndicationToken(cases[0]!.ref.id)}`,
    );
  });

  it.each([
    [404, "syn-deleted-404.html"],
    [200, "syn-tombstone.json"],
  ] as const)("returns null for %s %s", async (status, file) => {
    expect(
      await fromSyndication(
        { id: "1", handle: "jack" },
        { fetch: fakeFetch({ syn: [status, file] }) },
      ),
    ).toBeNull();
  });
});

describe("resolvePost", () => {
  const ref = cases[1]!.ref;

  it("prefers FxTwitter and does not call syndication", async () => {
    const fetch = fakeFetch({
      fx: [200, "fx-photo.json"],
      syn: [200, "syn-photo.json"],
    });
    expect(await resolvePost(ref, { fetch })).not.toBeNull();
    expect(fetch.calls).toHaveLength(1);
  });

  it("falls back to syndication", async () => {
    const fetch = fakeFetch({
      fx: [429, "fx-rate-limited-429.json"],
      syn: [200, "syn-photo.json"],
    });
    const post = await resolvePost(ref, { fetch });
    expect(post?.handle).toBe("NASA");
    expect(fetch.calls).toHaveLength(2);
  });

  it("returns null when both fail", async () => {
    expect(await resolvePost(ref, { fetch: fakeFetch({}) })).toBeNull();
  });
});
