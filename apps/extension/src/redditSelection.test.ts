import { describe, expect, it } from "vitest";
import { RedditSelection } from "./redditSelection";

const post = {
  id: "abc123",
  title: "First post snapshot",
  text: "Body",
  images: ["https://i.redd.it/image.png"],
};
const comment = (id: string, postId = "abc123") => ({
  id,
  postId,
  text: `Selected ${id}`,
});

describe("post-scoped Reddit selection", () => {
  it("cannot select or begin a request without an active detail post", () => {
    const s = new RedditSelection();
    expect(s.toggle(comment("c1", "invalid!"), true)).toBe("invalid");
    expect(s.begin({ ...post, id: "invalid!" })).toBeNull();
    expect(s.count).toBe(0);
  });
  it("keeps independent parent/reply snapshots, deduplicates IDs, and survives same-post rerenders", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    const parent = comment("parent1");
    s.toggle(parent, true);
    parent.text = "Changed DOM";
    s.toggle({ ...comment("parent1"), text: "Re-rendered" }, true);
    s.toggle(comment("reply1"), true);
    s.navigate("abc123");
    expect(s.selected()).toEqual([
      { id: "parent1", postId: "abc123", text: "Selected parent1" },
      { id: "reply1", postId: "abc123", text: "Selected reply1" },
    ]);
    expect(s.toggle(comment("parent1"), false)).toBe("removed");
    expect(s.count).toBe(1);
  });
  it("allows deselection at the 20-comment limit without silently dropping a selection", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    for (let i = 0; i < 20; i++) s.toggle(comment(`c${i}`), true);
    expect(s.toggle(comment("overflow"), true)).toBe("limit");
    expect(s.count).toBe(20);
    expect(s.toggle(comment("c0"), false)).toBe("removed");
    expect(s.toggle(comment("overflow"), true)).toBe("kept");
    expect(s.count).toBe(20);
  });
  it("rejects selections from another post and clears when leaving or opening a new post", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    expect(s.toggle(comment("c1", "other1"), true)).toBe("invalid");
    s.toggle(comment("c1"), true);
    s.navigate(null);
    expect(s.selected()).toEqual([]);
    s.navigate("other1");
    expect(s.selected()).toEqual([]);
  });
  it("freezes a stable request and suppresses changes while it is pending", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    s.toggle(comment("c1"), true);
    const input = { ...post, images: [...post.images] };
    const request = s.begin(input)!;
    input.title = "Changed";
    input.images.push("https://i.redd.it/new.png");
    expect(request.args.post.title).toBe("First post snapshot");
    expect(request.args.post.images).toEqual(["https://i.redd.it/image.png"]);
    expect(s.toggle(comment("c1"), false)).toBe("busy");
    expect(s.begin(post)).toBeNull();
    expect(request.args.comments).toEqual([
      { id: "c1", postId: "abc123", text: "Selected c1" },
    ]);
  });
  it("retains failed selections and retries the same payload until the selection changes", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    s.toggle(comment("c1"), true);
    const first = s.begin(post)!;
    s.finish(first, false);
    expect(s.count).toBe(1);
    const retry = s.begin({ ...post, title: "New DOM title" })!;
    expect(retry.args).toEqual(first.args);
    s.finish(retry, false);
    s.toggle(comment("c2"), true);
    expect(s.begin({ ...post, title: "New DOM title" })!.args.post.title).toBe(
      "New DOM title",
    );
  });
  it("clears only a confirmed request belonging to the current navigation generation", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    s.toggle(comment("c1"), true);
    const old = s.begin(post)!;
    s.navigate("other1");
    s.toggle(comment("c2", "other1"), true);
    expect(s.finish(old, true)).toBe(false);
    expect(s.count).toBe(1);
    const current = s.begin({ ...post, id: "other1" })!;
    expect(s.finish(current, true)).toBe(true);
    expect(s.count).toBe(0);
  });
  it("ignores an old completion even after navigating away and back to the same post", () => {
    const s = new RedditSelection();
    s.navigate("abc123");
    s.toggle(comment("c1"), true);
    const old = s.begin(post)!;
    s.navigate(null);
    s.navigate("abc123");
    s.toggle(comment("c2"), true);
    const current = s.begin(post)!;
    expect(s.finish(old, true)).toBe(false);
    expect(s.count).toBe(1);
    expect(s.isBusy).toBe(true);
    s.finish(current, true);
    expect(s.count).toBe(0);
  });
});
