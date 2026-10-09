import { describe, expect, it } from "vitest";
import { RedditCommentClips } from "./redditCommentClips";
const post = {
  id: "abc123",
  title: "Post",
  text: "Original",
  images: ["https://example.com/a.jpg"],
};
const comment = { id: "parent1", postId: "abc123", text: "Parent" };
describe("independent comment requests", () => {
  it("freezes each snapshot and permits independent saves", () => {
    const state = new RedditCommentClips();
    state.navigate("abc123");
    const first = state.begin(post, comment)!;
    expect(first.args.comments).toEqual([comment]);
    expect(Object.isFrozen(first.args.post.images)).toBe(true);
    expect(Object.isFrozen(first.args.comments[0])).toBe(true);
    expect(state.begin(post, comment)).toBeNull();
    const reply = state.begin(post, { ...comment, id: "reply1" })!;
    expect(reply).toBeTruthy();
    state.finish(first, false, "No connection, try again");
    const retry = state.begin(
      { ...post, text: "Changed" },
      { ...comment, text: "Edited" },
    )!;
    expect(retry.args).toBe(first.args);
    expect(state.finish(reply, true)).toBe(true);
    expect(state.begin(post, { ...comment, id: "reply1" })).toBeNull();
  });
  it("retains retries without a readable post and ignores old generations", () => {
    const state = new RedditCommentClips();
    state.navigate("abc123");
    expect(state.begin(null, comment)).toBeNull();
    const first = state.begin(post, comment)!;
    state.finish(first, false, "Something went wrong");
    state.navigate("abc123");
    expect(state.begin(null, comment)!.args).toBe(first.args);
    state.navigate(null);
    state.navigate("abc123");
    expect(state.finish(first, true)).toBe(false);
    expect(state.status(comment.id).text).toBe("Clip");
    expect(state.begin(post, { ...comment, postId: "other1" })).toBeNull();
  });
});
