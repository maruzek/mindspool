export type Tweet = {
  id: string;
  url: string;
  author: string;
  handle: string;
  text: string;
  images: string[];
};

const STATUS_PATH = /^\/([^/]+)\/status\/(\d+)/;

/** Text of a node with emoji images as their `alt` and `<br>` as a line break (jsdom has no `innerText`). */
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  if (node instanceof HTMLImageElement) return node.alt;
  if (node instanceof HTMLBRElement) return "\n";
  return Array.from(node.childNodes, textOf).join("");
}

/** Whether `el` belongs to `article` itself, not to a nested article or a quoted tweet inside it. */
export function isOwnedBy(article: Element, el: Element): boolean {
  const quote = el.closest('[data-testid="quoteTweet"]');
  return (
    el.closest("article") === article && !(quote && article.contains(quote))
  );
}

/**
 * Reads the outer tweet of a tweet `article`. Anything inside a nested
 * article or a quoted tweet belongs to another tweet and is ignored.
 * Null when there is no permalink, or neither text nor images.
 */
export function parseTweet(article: Element): Tweet | null {
  const owned = (selector: string) =>
    Array.from(article.querySelectorAll(selector)).filter((el) =>
      isOwnedBy(article, el),
    );
  // A quoted tweet repeats the author block after the tweet's own content, so
  // whatever follows the second one belongs to the quote.
  const quoteStart = owned('[data-testid="User-Name"]')[1];
  const ownAll = (selector: string) =>
    owned(selector).filter(
      (el) =>
        !quoteStart ||
        !(
          quoteStart.compareDocumentPosition(el) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    );

  const permalink = ownAll('a[href*="/status/"]').find((a) =>
    a.querySelector("time"),
  );
  const path = permalink
    ? STATUS_PATH.exec(
        new URL(permalink.getAttribute("href") ?? "", "https://x.com").pathname,
      )
    : null;
  if (!path) return null;
  const [, user, id] = path as unknown as [string, string, string];

  const links = Array.from(
    ownAll('[data-testid="User-Name"]')[0]?.querySelectorAll("a") ?? [],
    (a) => (a.textContent ?? "").trim(),
  );
  const handle = links.find((t) => t.startsWith("@"))?.slice(1) ?? user;
  const author = links.find((t) => t && !t.startsWith("@")) ?? "";

  const textEl = ownAll('[data-testid="tweetText"]')[0];
  const text = textEl ? textOf(textEl).trim() : "";

  const images = new Set<string>();
  for (const img of ownAll('[data-testid="tweetPhoto"] img')) {
    try {
      const url = new URL((img as HTMLImageElement).src);
      if (url.protocol !== "https:") continue;
      url.searchParams.set("name", "large");
      images.add(url.toString());
    } catch {
      // Not a usable image URL.
    }
  }

  if (!text && images.size === 0) return null;
  return {
    id,
    url: `https://x.com/${user}/status/${id}`,
    author,
    handle,
    text,
    images: [...images],
  };
}
