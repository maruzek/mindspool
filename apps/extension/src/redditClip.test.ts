import { expect, it } from "vitest";
import { buildRedditClip } from "./redditClip";

it("maps a post plus exactly the selected snapshots to the dedicated contract", () => {
  expect(
    buildRedditClip(
      {
        id: "abc123",
        title: "Post",
        author: "u/reader",
        subreddit: "example",
        text: "Available body",
        images: ["https://i.redd.it/image.png?keep=1"],
      },
      [
        {
          id: "reply1",
          postId: "abc123",
          author: "u/replyreader",
          text: "Selected reply",
        },
      ],
    ),
  ).toEqual({
    post: {
      id: "abc123",
      title: "Post",
      author: "u/reader",
      subreddit: "example",
      text: "Available body",
      images: ["https://i.redd.it/image.png?keep=1"],
    },
    comments: [
      {
        id: "reply1",
        postId: "abc123",
        author: "u/replyreader",
        text: "Selected reply",
      },
    ],
  });
});
it("maps a title-only post with an empty selection", () => {
  expect(
    buildRedditClip({
      id: "abc123",
      title: "Title only",
      text: "",
      images: [],
    }),
  ).toEqual({
    post: { id: "abc123", title: "Title only", text: "", images: [] },
    comments: [],
  });
});
