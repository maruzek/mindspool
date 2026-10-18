import type { Infer } from "convex/values";
import { z } from "zod";
import { renderRedditCapture } from "../../../../schema/src/reddit";
import { urlKey } from "../../../../schema/src/links";
import { MAX_TOOL_BYTES, toolBytes, McpToolError } from "../tools";
import type { itemDetail } from "../../validators";

const label = z.strictObject({
  id: z.string(),
  name: z.string(),
  suggested: z.literal(true).optional(),
});
export const detailSchema = z.strictObject({
  itemId: z.string(),
  savedAt: z.string(),
  url: z.string().optional(),
  canonicalUrl: z.string().optional(),
  inputType: z.string(),
  captureSource: z.string(),
  enrichment: z.enum(["not_started", "pending", "succeeded", "failed"]),
  linkedPageRead: z.boolean(),
  metadataTruncated: z.boolean().optional(),
  imageUrlsTruncated: z.boolean().optional(),
  metadata: z
    .strictObject({
      title: z.string().optional(),
      description: z.string().optional(),
      author: z.string().optional(),
      siteName: z.string().optional(),
    })
    .optional(),
  userInput: z.strictObject({ text: z.string(), truncated: z.boolean() }),
  links: z
    .array(
      z.strictObject({
        url: z.string(),
        role: z.enum(["original", "canonical", "in-content"]),
      }),
    )
    .optional(),
  linksTruncated: z.boolean().optional(),
  fromPost: z
    .strictObject({
      itemId: z.string(),
      url: z.string(),
      title: z.string().optional(),
      excerpt: z.string().optional(),
    })
    .optional(),
  linkedItems: z
    .array(
      z.strictObject({
        itemId: z.string(),
        url: z.string(),
        title: z.string().optional(),
        snippet: z.string().optional(),
        enrichment: z.enum(["not_started", "pending", "succeeded", "failed"]),
      }),
    )
    .optional(),
  linkedItemsTruncated: z.boolean().optional(),
  labels: z.array(label),
  labelsTruncated: z.boolean(),
  imageUrls: z.array(z.string()).optional(),
  content: z.strictObject({
    text: z.string(),
    offset: z.number().int().nonnegative(),
    nextOffset: z.number().int().nonnegative().optional(),
    totalChars: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  untrusted: z.literal(true),
});

type DetailRow = Infer<typeof itemDetail> & {
  labels: z.infer<typeof label>[];
  labelsTruncated: boolean;
  linkedItems?: z.infer<typeof detailSchema>["linkedItems"];
  linkedItemsTruncated?: boolean;
};

/** URLs as saved, with original/canonical taking precedence over text links. */
export function linksOf(
  row: Pick<DetailRow, "originalUrl" | "canonicalUrl">,
  text: string,
) {
  const links: NonNullable<z.infer<typeof detailSchema>["links"]> = [];
  const seen = new Set<string>();
  let truncated = false;
  function add(url: string | undefined, role: (typeof links)[number]["role"]) {
    if (!url) return;
    const key = urlKey(url);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (links.length === 50) {
      truncated = true;
      return;
    }
    links.push({ url, role });
  }
  add(row.originalUrl, "original");
  add(row.canonicalUrl, "canonical");
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>`]+/gi)) {
    add(trimLink(match[0]), "in-content");
    if (truncated) break;
  }
  return { links, linksTruncated: truncated };
}

/** One balance pass and one trailing scan keep untrusted punctuation linear. */
function trimLink(raw: string) {
  let parentheses = 0;
  let brackets = 0;
  for (const char of raw) {
    if (char === ")") parentheses++;
    else if (char === "(") parentheses--;
    else if (char === "]") brackets++;
    else if (char === "[") brackets--;
  }
  let end = raw.length;
  while (end > 0) {
    const char = raw[end - 1]!;
    if (".,;:!?…*".includes(char)) end--;
    else if (char === ")" && parentheses > 0) {
      parentheses--;
      end--;
    } else if (char === "]" && brackets > 0) {
      brackets--;
      end--;
    } else break;
  }
  return raw.slice(0, end);
}

/** Pure boundary mapping; offsets use JavaScript character indices for exact reassembly. */
export function detailOf(
  row: DetailRow,
  offset: number,
  includeResources = offset === 0,
): z.infer<typeof detailSchema> {
  // Captures already have a persisted text projection; render the structured
  // snapshot once so legacy projections cannot omit or duplicate comments.
  const text = row.redditCapture
    ? renderRedditCapture(row.redditCapture)
    : (row.extractedText ?? "");
  const end = Math.min(offset + 20_000, text.length);
  const more = end < text.length;
  const result: z.infer<typeof detailSchema> = {
    itemId: row._id,
    savedAt: new Date(row._creationTime).toISOString(),
    ...(row.originalUrl ? { url: row.originalUrl } : {}),
    ...(row.canonicalUrl ? { canonicalUrl: row.canonicalUrl } : {}),
    inputType: row.inputType,
    captureSource: row.captureSource,
    enrichment: row.enrichmentStatus,
    linkedPageRead: row.enrichmentStatus === "succeeded" && text.length > 0,
    ...(row.sourceMetadata ? { metadata: row.sourceMetadata } : {}),
    userInput: {
      text: row.originalInput.slice(0, 4000),
      truncated: row.originalInput.length > 4000,
    },
    ...(includeResources ? linksOf(row, text) : {}),
    ...(includeResources && row.fromPost
      ? {
          fromPost: {
            itemId: row.fromPost._id,
            url: row.fromPost.url,
            ...(row.fromPost.title ? { title: row.fromPost.title } : {}),
            ...(row.fromPost.excerpt ? { excerpt: row.fromPost.excerpt } : {}),
          },
        }
      : {}),
    ...(includeResources && row.linkedItems
      ? {
          linkedItems: row.linkedItems.slice(),
          linkedItemsTruncated: row.linkedItemsTruncated ?? false,
        }
      : {}),
    labels: row.labels.slice(),
    labelsTruncated: row.labelsTruncated,
    ...(row.images?.length ? { imageUrls: row.images } : {}),
    content: {
      text: text.slice(offset, end),
      offset,
      ...(more ? { nextOffset: end } : {}),
      totalChars: text.length,
      truncated: more,
    },
    untrusted: true,
  };
  return fitDetail(result);
}

type Detail = z.infer<typeof detailSchema>;

/** Preserve an advancing content window, then fit the largest window by bytes. */
function fitDetail(result: Detail): Detail {
  if (toolBytes(result) <= MAX_TOOL_BYTES) return result;
  const window = result.content.text;
  const setWindow = (length: number) => {
    const next = result.content.offset + length;
    result.content = {
      text: window.slice(0, length),
      offset: result.content.offset,
      ...(next < result.content.totalChars ? { nextOffset: next } : {}),
      totalChars: result.content.totalChars,
      truncated: next < result.content.totalChars,
    };
  };
  setWindow(Math.min(1, window.length));
  if (toolBytes(result) > MAX_TOOL_BYTES && result.metadata) {
    delete result.metadata;
    result.metadataTruncated = true;
  }
  while (toolBytes(result) > MAX_TOOL_BYTES && result.labels.length) {
    result.labels.pop();
    result.labelsTruncated = true;
  }
  while (toolBytes(result) > MAX_TOOL_BYTES && result.imageUrls?.length) {
    result.imageUrls.pop();
    result.imageUrlsTruncated = true;
  }
  while (toolBytes(result) > MAX_TOOL_BYTES && result.linkedItems?.length) {
    result.linkedItems.pop();
    result.linkedItemsTruncated = true;
  }
  while (toolBytes(result) > MAX_TOOL_BYTES && result.links?.length) {
    result.links.pop();
    result.linksTruncated = true;
  }
  if (toolBytes(result) > MAX_TOOL_BYTES)
    throw new McpToolError(
      "UNAVAILABLE",
      "Item metadata exceeds the response budget",
    );
  let low = Math.min(1, window.length);
  let high = window.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    setWindow(mid);
    if (toolBytes(result) <= MAX_TOOL_BYTES) low = mid;
    else high = mid - 1;
  }
  setWindow(low);
  return result;
}
