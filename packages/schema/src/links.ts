/** Most links one tweet can turn into Items. */
export const MAX_TWEET_LINKS = 20;
/** A tweet is expanded into its links only when it mentions at least this many. */
export const MIN_TWEET_LINKS = 1;
const MAX_LINK_LENGTH = 2048;

const LINK = /https?:\/\/[^\s"'<>`]+/gi;
const TRAILING = /[.,;:!?…'"*]+$/;
/** The tweet itself, its media pages, profiles and unexpanded short links. */
const SKIPPED_HOSTS = ["x.com", "twitter.com", "t.co"];
const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref_src|igshid|si)$/i;

function parse(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const hostOf = (url: URL) =>
  url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");

/**
 * The identity of a link for dedupe: host without `www.`, port when not the
 * default, path without a trailing slash, and the non-tracking query
 * parameters sorted. The scheme and fragment are ignored. Null for anything
 * that is not an http(s) URL.
 */
export function urlKey(raw: string): string | null {
  const url = parse(raw.trim());
  if (!url) return null;
  const params = [...url.searchParams]
    .filter(([name]) => !TRACKING.test(name))
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const query = new URLSearchParams(params).toString();
  const port = url.port ? `:${url.port}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `${hostOf(url)}${port}${path}${query ? `?${query}` : ""}`;
}

/** Trailing punctuation that ends the sentence, and a closing bracket the link never opened. */
function trimLink(link: string) {
  let out = link;
  for (;;) {
    const next = out.replace(TRAILING, "");
    const close = next.at(-1);
    const open = close === ")" ? "(" : close === "]" ? "[" : undefined;
    const unbalanced =
      open !== undefined && next.split(close!).length > next.split(open).length;
    const trimmed = unbalanced ? next.slice(0, -1) : next;
    if (trimmed === out) return out;
    out = trimmed;
  }
}

function skipped(url: URL) {
  const host = hostOf(url);
  return SKIPPED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The http(s) links in a text, as written, in order of appearance: unique by
 * `urlKey`, without X/Twitter/t.co links, at most `MAX_TWEET_LINKS`.
 */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const link = trimLink(match[0]);
    if (link.length > MAX_LINK_LENGTH) continue;
    const url = parse(link);
    const key = url && !skipped(url) ? urlKey(link) : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    links.push(link);
    if (links.length === MAX_TWEET_LINKS) break;
  }
  return links;
}
