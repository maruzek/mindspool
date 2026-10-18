import type { Infer } from "convex/values";
import { z } from "zod";
import { MAX_TOOL_BYTES, McpToolError, toolBytes } from "../tools";
import type { itemDetail } from "../../validators";
import { detailSchema, linksOf } from "./shape";
import type { StreamName } from "./streams";
import {
  contentOf,
  streamText,
  streamVersion,
  userInputRelation,
} from "./streams";

// Efficient, explicit-mode item reading: metadata, an excerpt or a full-text
// window of one stream, with identity (a version) and no repeated context.

export const EXCERPT_DEFAULT = 2_000;
export const EXCERPT_MAX = 4_000;
export const FULL_MAX = 20_000;

export type ReadMode = "metadata" | "excerpt" | "full";

const streamInfo = z.strictObject({
  totalChars: z.number().int().nonnegative(),
  version: z.string(),
});
const contextSchema = z.strictObject({
  savedAt: z.string(),
  inputType: z.string(),
  captureSource: z.string(),
  enrichment: z.enum(["not_started", "pending", "succeeded", "failed"]),
  linkedPageRead: z.boolean(),
  url: z.string().optional(),
  canonicalUrl: z.string().optional(),
  metadata: detailSchema.shape.metadata,
  metadataTruncated: z.boolean().optional(),
  labels: detailSchema.shape.labels,
  labelsTruncated: z.boolean(),
});
const resourcesSchema = detailSchema.pick({
  links: true,
  linksTruncated: true,
  fromPost: true,
  linkedItems: true,
  linkedItemsTruncated: true,
});
const streamName = z.enum(["content", "userInput"]);

/**
 * Object-root schema for both interfaces: the legacy detail (no `mode`) and the
 * efficient variants, whose shape is enforced by the refinement below.
 */
export const readOutputSchema = detailSchema
  .partial()
  .extend({
    itemId: z.string(),
    untrusted: z.literal(true),
    mode: z.enum(["metadata", "excerpt", "full"]).optional(),
    stream: streamName.optional(),
    content: detailSchema.shape.content
      .extend({ version: z.string().optional() })
      .optional(),
    streams: z
      .strictObject({
        content: streamInfo,
        userInput: streamInfo.extend({
          relation: z.enum(["empty", "content", "url", "distinct"]),
        }),
      })
      .optional(),
    context: contextSchema.optional(),
    resources: resourcesSchema.optional(),
  })
  .refine(
    (value) =>
      value.mode === undefined
        ? value.content !== undefined &&
          value.savedAt !== undefined &&
          value.userInput !== undefined &&
          value.streams === undefined &&
          value.context === undefined
        : value.mode === "metadata"
          ? value.content === undefined &&
            value.context !== undefined &&
            value.streams !== undefined
          : value.stream !== undefined &&
            value.content?.version !== undefined &&
            value.savedAt === undefined &&
            value.userInput === undefined,
    "Output does not match its mode",
  );

type ReadRow = Omit<Infer<typeof itemDetail>, "images" | "imageAssets"> & {
  labels?: z.infer<typeof contextSchema>["labels"];
  labelsTruncated?: boolean;
  linkedItems?: z.infer<typeof detailSchema>["linkedItems"];
  linkedItemsTruncated?: boolean;
};

export type ReadRequest = {
  mode: ReadMode;
  stream: StreamName;
  offset: number;
  maxChars: number;
  version?: string;
  includeContext: boolean;
  includeResources: boolean;
};

type Output = {
  itemId: string;
  mode: ReadMode;
  stream?: StreamName;
  content?: {
    text: string;
    offset: number;
    nextOffset?: number;
    totalChars: number;
    truncated: boolean;
    version: string;
  };
  streams?: z.infer<typeof readOutputSchema>["streams"];
  context?: z.infer<typeof contextSchema>;
  resources?: z.infer<typeof resourcesSchema>;
  untrusted: true;
};

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const splitsPair = (text: string, at: number) =>
  at > 0 &&
  at < text.length &&
  isHigh(text.charCodeAt(at - 1)) &&
  isLow(text.charCodeAt(at));

/** End of a window of at most `length` units that never splits a surrogate pair; may equal `offset`. */
function windowEnd(text: string, offset: number, length: number) {
  const end = Math.min(offset + length, text.length);
  return splitsPair(text, end) ? end - 1 : end;
}

function contextOf(row: ReadRow, linkedPageRead: boolean) {
  return {
    savedAt: new Date(row._creationTime).toISOString(),
    inputType: row.inputType,
    captureSource: row.captureSource,
    enrichment: row.enrichmentStatus,
    linkedPageRead,
    ...(row.originalUrl ? { url: row.originalUrl } : {}),
    // Only an exactly equal canonical URL is redundant; aliases stay visible.
    ...(row.canonicalUrl && row.canonicalUrl !== row.originalUrl
      ? { canonicalUrl: row.canonicalUrl }
      : {}),
    ...(row.sourceMetadata ? { metadata: row.sourceMetadata } : {}),
    labels: (row.labels ?? []).slice(),
    labelsTruncated: row.labelsTruncated ?? false,
  };
}

export async function efficientReadOf(
  row: ReadRow,
  request: ReadRequest,
): Promise<Output> {
  const content = contentOf(row);
  const output: Output = {
    itemId: row._id,
    mode: request.mode,
    untrusted: true,
  };

  const needStreams = request.includeContext || request.mode === "metadata";
  const versions = {
    content: await streamVersion(row._id, "content", content),
    userInput: await streamVersion(row._id, "userInput", row.originalInput),
  };

  let text = "";
  let end = 0;
  if (request.mode !== "metadata") {
    text = streamText(row, request.stream);
    const { offset } = request;
    if (offset > text.length)
      throw new McpToolError(
        "INVALID_INPUT",
        `offset is beyond the end of the ${request.stream} stream (${text.length} characters)`,
      );
    if (splitsPair(text, offset))
      throw new McpToolError(
        "INVALID_INPUT",
        "offset falls inside a character; use a nextOffset returned by a previous read",
      );
    if (
      request.version !== undefined &&
      request.version !== versions[request.stream]
    )
      throw new McpToolError(
        "CONFLICT",
        "The saved text changed since this version; restart at offset 0",
        false,
      );
    end = windowEnd(text, offset, request.maxChars);
    if (end === offset && offset < text.length)
      throw new McpToolError(
        "INVALID_INPUT",
        "maxChars must be at least 2 where the next character takes two units",
      );
    output.stream = request.stream;
  }

  const setWindow = (to: number) => {
    output.content = {
      text: text.slice(request.offset, to),
      offset: request.offset,
      ...(to < text.length ? { nextOffset: to } : {}),
      totalChars: text.length,
      truncated: to < text.length,
      version: versions[request.stream],
    };
  };
  if (request.mode !== "metadata") setWindow(end);

  if (needStreams) {
    output.streams = {
      content: { totalChars: content.length, version: versions.content },
      userInput: {
        totalChars: row.originalInput.length,
        version: versions.userInput,
        relation: userInputRelation(row, content),
      },
    };
    output.context = contextOf(
      row,
      row.enrichmentStatus === "succeeded" && content.length > 0,
    );
  }
  if (request.includeResources) {
    output.resources = {
      ...linksOf(row, content),
      ...(row.fromPost
        ? {
            fromPost: {
              itemId: row.fromPost._id,
              url: row.fromPost.url,
              ...(row.fromPost.title ? { title: row.fromPost.title } : {}),
              ...(row.fromPost.excerpt
                ? { excerpt: row.fromPost.excerpt }
                : {}),
            },
          }
        : {}),
      ...(row.linkedItems
        ? {
            linkedItems: row.linkedItems.slice(),
            linkedItemsTruncated: row.linkedItemsTruncated ?? false,
          }
        : {}),
    };
  }
  return fit(output, text, request.offset, end, setWindow);
}

const over = (output: unknown) => toolBytes(output) > MAX_TOOL_BYTES;

/** Shrinks optional context first, then the text window, never URLs or attribution. */
function fit(
  output: Output,
  text: string,
  offset: number,
  end: number,
  setWindow: (to: number) => void,
): Output {
  if (!over(output)) return output;
  // Smallest legal window: one unit, or two where a surrogate pair starts.
  const minLength = windowEnd(text, offset, 1) > offset ? 1 : 2;
  const maxLength = end - offset;
  const shrink = (length: number) => setWindow(windowEnd(text, offset, length));
  if (output.content) shrink(Math.min(minLength, maxLength));
  const context = output.context;
  if (over(output) && context?.metadata) {
    delete context.metadata;
    context.metadataTruncated = true;
  }
  while (over(output) && context?.labels.length) {
    context.labels.pop();
    context.labelsTruncated = true;
  }
  const resources = output.resources;
  while (over(output) && resources?.linkedItems?.length) {
    resources.linkedItems.pop();
    resources.linkedItemsTruncated = true;
  }
  while (over(output) && resources?.links?.length) {
    resources.links.pop();
    resources.linksTruncated = true;
  }
  if (over(output))
    throw new McpToolError(
      "UNAVAILABLE",
      output.resources
        ? "Item metadata exceeds the response budget; retry with includeResources false"
        : "Item metadata exceeds the response budget; retry with includeContext false",
    );
  if (output.content) {
    let low = Math.min(minLength, maxLength);
    let high = maxLength;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      shrink(mid);
      if (over(output)) high = mid - 1;
      else low = mid;
    }
    shrink(low);
  }
  return output;
}
