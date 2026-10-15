export type PageMetadata = {
  title?: string;
  description?: string;
  siteName?: string;
  author?: string;
  canonicalUrl?: string;
  image?: string;
};

const TEXT_LIMIT = {
  title: 500,
  description: 2000,
  siteName: 200,
  author: 200,
};
const URL_LIMIT = 2000;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string) {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
    (match, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
      const code = dec ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    },
  );
}

function clean(value: string | undefined, limit: number) {
  const text = decodeEntities(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, limit) : undefined;
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  const raw = clean(value, URL_LIMIT);
  if (!raw) return undefined;
  try {
    const url = new URL(raw, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    if (url.username || url.password) return undefined;
    return url.href.length <= URL_LIMIT ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const ATTRIBUTE =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributes(source: string) {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? "").toLowerCase();
    if (!(name in result))
      result[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

/**
 * Reads Open Graph / Twitter-card tags, `<title>`, the description and the
 * canonical link from the `<head>` of a page. Tolerant of malformed markup;
 * never throws.
 */
export function parseMetadata(html: string, baseUrl: string): PageMetadata {
  const bodyAt = html.search(/<body[\s>]/i);
  const head = bodyAt === -1 ? html : html.slice(0, bodyAt);
  const meta = new Map<string, string>();
  let canonical: string | undefined;
  let title: string | undefined;

  // Markup inside comments and raw-text elements is not page metadata.
  const stripped = head
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  // Quote-aware, so a ">" inside an attribute value does not end the tag.
  const tags = /<(meta|link)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
  for (const tag of stripped.matchAll(tags)) {
    const attrs = attributes(tag[2] ?? "");
    if ((tag[1] ?? "").toLowerCase() === "meta") {
      const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
      if (key && attrs.content !== undefined && !meta.has(key))
        meta.set(key, attrs.content);
    } else if (
      canonical === undefined &&
      (attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical") &&
      attrs.href
    ) {
      canonical = attrs.href;
    }
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(stripped);
  if (titleTag) title = titleTag[1];

  const first = (limit: number, ...keys: string[]) => {
    for (const key of keys) {
      const value = clean(meta.get(key), limit);
      if (value) return value;
    }
    return undefined;
  };
  const image = (() => {
    for (const key of ["og:image", "twitter:image", "og:image:secure_url"]) {
      const url = absoluteUrl(meta.get(key), baseUrl);
      if (url) return url;
    }
    return undefined;
  })();

  const result: PageMetadata = {
    title:
      first(TEXT_LIMIT.title, "og:title", "twitter:title") ??
      clean(title, TEXT_LIMIT.title),
    description: first(
      TEXT_LIMIT.description,
      "og:description",
      "twitter:description",
      "description",
    ),
    siteName: first(TEXT_LIMIT.siteName, "og:site_name"),
    author: first(TEXT_LIMIT.author, "author", "article:author"),
    canonicalUrl:
      absoluteUrl(meta.get("og:url"), baseUrl) ??
      absoluteUrl(canonical, baseUrl),
    image,
  };
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as PageMetadata;
}
