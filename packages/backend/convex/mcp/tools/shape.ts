import type { Infer } from "convex/values";
import { z } from "zod";
import { renderRedditCapture } from "../../../../schema/src/reddit";
import { urlKey } from "../../../../schema/src/links";
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
  metadata: z
    .strictObject({
      title: z.string().optional(),
      description: z.string().optional(),
      author: z.string().optional(),
      siteName: z.string().optional(),
    })
    .optional(),
  userInput: z.strictObject({ text: z.string(), truncated: z.boolean() }),
  links: z.array(
    z.strictObject({
      url: z.string(),
      role: z.enum(["original", "canonical", "in-content"]),
    }),
  ),
  linksTruncated: z.boolean(),
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
};

/** URLs as saved, with original/canonical taking precedence over text links. */
function linksOf(row: DetailRow, text: string) {
  const links: z.infer<typeof detailSchema>["links"] = [];
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
): z.infer<typeof detailSchema> {
  // Captures already have a persisted text projection; render the structured
  // snapshot once so legacy projections cannot omit or duplicate comments.
  const text = row.redditCapture
    ? renderRedditCapture(row.redditCapture)
    : (row.extractedText ?? "");
  const end = Math.min(offset + 20_000, text.length);
  const more = end < text.length;
  return {
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
    ...linksOf(row, text),
    labels: row.labels,
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
}
