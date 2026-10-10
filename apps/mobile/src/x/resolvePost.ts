import type { ResolvedPost, ResolverDeps, ShareRef } from "./types";

export const MAX_IMAGES = 10;
const MAX_IMAGE_URL = 2048;
const DEFAULT_TIMEOUT_MS = 8000;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** Same normalization as the extension: https only, `?name=large`. */
export function normalizeImage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("name", "large");
    const href = url.toString();
    return href.length > MAX_IMAGE_URL ? null : href;
  } catch {
    return null;
  }
}

export function uniqueImages(candidates: unknown[]): string[] {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const url = normalizeImage(candidate);
    if (url) seen.add(url);
    if (seen.size === MAX_IMAGES) break;
  }
  return [...seen];
}

async function getJson(url: string, deps: ResolverDeps): Promise<Json | null> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await deps.fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    // Some "not found" answers are HTML with status 200, so parse defensively.
    const body: unknown = JSON.parse(await response.text());
    return isObject(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fromFxTweet(ref: ShareRef, body: Json): ResolvedPost | null {
  const tweet = body["tweet"];
  if (body["code"] !== 200 || !isObject(tweet)) return null;
  const author = tweet["author"];
  if (!isObject(author) || tweet["id"] !== ref.id) return null;
  const handle = str(author["screen_name"]);
  if (!handle) return null;

  const media = isObject(tweet["media"]) ? tweet["media"] : {};
  const list = (key: string): Json[] =>
    Array.isArray(media[key]) ? media[key].filter(isObject) : [];
  const photos = list("photos").map((photo) => photo["url"]);
  const posters = [...list("videos"), ...list("all")]
    .filter((m) => m["type"] === "video" || m["type"] === "gif")
    .map((m) => m["thumbnail_url"]);

  return {
    id: ref.id,
    handle,
    author: str(author["name"]),
    text: str(tweet["text"]).trim(),
    images: uniqueImages(photos.length > 0 ? photos : posters.slice(0, 1)),
  };
}

export async function fromFxTwitter(
  ref: ShareRef,
  deps: ResolverDeps,
): Promise<ResolvedPost | null> {
  const body = await getJson(
    `https://api.fxtwitter.com/${encodeURIComponent(ref.handle)}/status/${ref.id}`,
    deps,
  );
  return body ? fromFxTweet(ref, body) : null;
}

/** The token the X embed script computes for a post id. */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/**
 * Text without the media links X appends, with short links expanded. The
 * `display_text_range` is not used: it does not line up with the link for
 * posts containing emoji.
 */
function syndicationText(tweet: Json): string {
  let text = str(tweet["text"]);
  const entities = isObject(tweet["entities"]) ? tweet["entities"] : {};
  const entries = (key: string): Json[] =>
    Array.isArray(entities[key]) ? entities[key].filter(isObject) : [];
  for (const entry of entries("media"))
    text = text.split(str(entry["url"]) || "\0").join("");
  for (const entry of entries("urls")) {
    const short = str(entry["url"]);
    const expanded = str(entry["expanded_url"]);
    if (short && expanded) text = text.split(short).join(expanded);
  }
  return text.trim();
}

function fromSyndicationTweet(ref: ShareRef, tweet: Json): ResolvedPost | null {
  const user = tweet["user"];
  if (!isObject(user) || tweet["id_str"] !== ref.id) return null;
  const handle = str(user["screen_name"]);
  if (!handle) return null;
  const photos = Array.isArray(tweet["photos"])
    ? tweet["photos"].filter(isObject).map((photo) => photo["url"])
    : [];
  const video = isObject(tweet["video"]) ? tweet["video"]["poster"] : undefined;
  return {
    id: ref.id,
    handle,
    author: str(user["name"]),
    text: syndicationText(tweet),
    images: uniqueImages(photos.length > 0 ? photos : [video]),
  };
}

export async function fromSyndication(
  ref: ShareRef,
  deps: ResolverDeps,
): Promise<ResolvedPost | null> {
  const query = new URLSearchParams({
    id: ref.id,
    lang: "en",
    token: syndicationToken(ref.id),
  });
  const body = await getJson(
    `https://cdn.syndication.twimg.com/tweet-result?${query}`,
    deps,
  );
  return body ? fromSyndicationTweet(ref, body) : null;
}

/** FxTwitter first, X syndication second, null when neither answers. */
export async function resolvePost(
  ref: ShareRef,
  deps: ResolverDeps,
): Promise<ResolvedPost | null> {
  return (
    (await fromFxTwitter(ref, deps)) ??
    (await fromSyndication(ref, deps)) ??
    null
  );
}
