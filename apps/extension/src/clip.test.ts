import { describe, expect, it } from "vitest";
import { buildClip } from "./clip";
import type { Tweet } from "./tweet";

const tweet: Tweet = {
  id: "1002",
  url: "https://x.com/pics/status/1002",
  author: "Pics & Co",
  handle: "pics",
  text: "Two photos\nline two",
  images: [
    "https://pbs.twimg.com/media/AAA?format=jpg&name=large",
    "https://pbs.twimg.com/media/BBB?format=png&name=large",
  ],
};

describe("buildClip", () => {
  it("maps a tweet to the items.create arguments", () => {
    expect(buildClip(tweet)).toEqual({
      originalInput: "https://x.com/pics/status/1002",
      inputType: "url",
      captureSource: "extension",
      captureKey: "x:1002",
      sourceMetadata: {
        title: "Pics & Co (@pics)",
        author: "pics",
        siteName: "X",
      },
      extractedText: "Two photos\nline two",
      imageAssets: [
        {
          kind: "external",
          url: "https://pbs.twimg.com/media/AAA?format=jpg&name=large",
          purpose: "image",
        },
        {
          kind: "external",
          url: "https://pbs.twimg.com/media/BBB?format=png&name=large",
          purpose: "image",
        },
      ],
    });
  });
  it("gives an empty image list for a text-only tweet", () => {
    expect(buildClip({ ...tweet, images: [] }).imageAssets).toEqual([]);
  });
  it("is stable for the same tweet and leaves it untouched", () => {
    const copy = structuredClone(tweet);
    expect(buildClip(tweet)).toEqual(buildClip(tweet));
    expect(tweet).toEqual(copy);
  });
});
