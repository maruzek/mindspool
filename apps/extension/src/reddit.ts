import {
  normalizeRedditId,
  redditIdentityFromUrl,
  REDDIT_TEXT_LIMIT,
} from "@mindspool/schema";
import type { RedditPostInput } from "@mindspool/schema";

/** Check visible DOM boundaries before reading text or source references. */
export function isReadable(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (
      node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true"
    )
      return false;
    if (
      node.tagName === "SHREDDIT-BLURRED-CONTAINER" &&
      node.hasAttribute("blurred")
    )
      return false;
    if (
      node.tagName === "DETAILS" &&
      !node.hasAttribute("open") &&
      !node.querySelector(":scope > summary")?.contains(element)
    )
      return false;
    const style = node.getAttribute("style") ?? "";
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return false;
  }
  return true;
}

export function readPlainText(root: Element): string {
  if (!isReadable(root)) return "";
  const walk = (node: Node, pre = false): string => {
    if (node.nodeType === 3)
      return pre
        ? (node.textContent ?? "")
        : (node.textContent ?? "").replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const element = node as Element;
    if (
      !isReadable(element) ||
      element.matches(
        'script,style,svg,button,input,select,textarea,shreddit-post,shreddit-comment,[role="button"],[data-mindspool-reddit]',
      )
    )
      return "";
    if (element.tagName === "BR") return "\n";
    if (element.tagName === "IMG") return element.getAttribute("alt") ?? "";
    const content = [...element.childNodes]
      .map((child) => walk(child, pre || element.tagName === "PRE"))
      .join("");
    if (element.tagName === "P") return `\n\n${content}\n\n`;
    if (element.tagName === "LI") return `${content}\n`;
    if (["DIV", "UL", "OL", "BLOCKQUOTE", "PRE"].includes(element.tagName))
      return `\n${content}\n`;
    return content;
  };
  return [...root.childNodes]
    .map((node) => walk(node))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function redditAuthor(raw: string | null): string | undefined {
  const name = raw?.trim().replace(/^u\//, "");
  return name && !["[deleted]", "deleted"].includes(name)
    ? `u/${name}`
    : undefined;
}

function own(post: Element, selector: string): Element[] {
  return [...post.querySelectorAll(selector)].filter(
    (node) => node.closest("shreddit-post") === post,
  );
}

function safeUrl(raw: string, limit: number, httpsOnly = false): string | null {
  try {
    const url = new URL(raw);
    return raw.length <= limit &&
      !url.username &&
      !url.password &&
      (httpsOnly
        ? url.protocol === "https:"
        : ["http:", "https:"].includes(url.protocol))
      ? raw
      : null;
  } catch {
    return null;
  }
}

/** Parse one current outer post, without reading page state or fetching content. */
export function parseRedditPost(post: Element): RedditPostInput | null {
  if (
    post.tagName !== "SHREDDIT-POST" ||
    post.parentElement?.closest("shreddit-post") ||
    !isReadable(post)
  )
    return null;
  const permalink =
    post.getAttribute("permalink") ??
    own(post, 'a[slot="title"],a[slot="full-post-link"]')[0]?.getAttribute(
      "href",
    );
  const identity = permalink && redditIdentityFromUrl(permalink);
  if (!identity) return null;
  const rawId = post.getAttribute("id");
  if (rawId && normalizeRedditId(rawId, "post") !== identity.postId)
    return null;
  const title = (
    post.getAttribute("post-title") ??
    own(post, '[slot="title"]')[0]?.textContent ??
    ""
  ).trim();
  const author = redditAuthor(post.getAttribute("author"));
  const subreddit = (
    post.getAttribute("subreddit-name") ??
    post.getAttribute("subreddit-prefixed-name")
  )
    ?.replace(/^r\//i, "")
    .toLowerCase();
  const body = own(post, '[slot="text-body"]').find(
    (node) =>
      !node.closest('[slot="post-media-container"]') && isReadable(node),
  );
  const text = body ? readPlainText(body) : "";
  if (
    !title ||
    title.length > 300 ||
    (author?.length ?? 0) > 300 ||
    (subreddit &&
      (!/^[a-z0-9_]+$/.test(subreddit) || subreddit.length + 2 > 1000)) ||
    text.length > REDDIT_TEXT_LIMIT
  )
    return null;

  const crosspost = post.getAttribute("post-type") === "crosspost";
  const contentHref = crosspost ? null : post.getAttribute("content-href");
  let outboundUrl: string | undefined;
  if (
    contentHref &&
    redditIdentityFromUrl(contentHref)?.postId !== identity.postId
  ) {
    const safe = safeUrl(contentHref, 8192);
    if (!safe) return null;
    outboundUrl = safe;
  }
  const images: string[] = [];
  if (!crosspost)
    for (const media of own(
      post,
      '[slot="post-media-container"],[slot="thumbnail"]',
    )) {
      if (!isReadable(media)) continue;
      for (const node of media.querySelectorAll(
        "img,shreddit-player[poster]",
      )) {
        if (node.closest("shreddit-post") !== post || !isReadable(node))
          continue;
        if (
          node.tagName === "IMG" &&
          (node.getAttribute("role") === "presentation" ||
            node.closest("shreddit-player"))
        )
          continue;
        const raw = node.getAttribute(
          node.tagName === "IMG" ? "src" : "poster",
        );
        const url = raw && safeUrl(raw, 2048, true);
        if (url && !images.includes(url) && images.length < 10)
          images.push(url);
      }
    }
  return {
    id: identity.postId,
    title,
    ...(author ? { author } : {}),
    ...(subreddit ? { subreddit } : {}),
    text,
    ...(outboundUrl ? { outboundUrl } : {}),
    images,
  };
}
