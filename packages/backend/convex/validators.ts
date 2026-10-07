import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";

export const captureSource = v.union(
  v.literal("web"),
  v.literal("mobile"),
  v.literal("extension"),
);
export const inputType = v.union(v.literal("url"), v.literal("text"));
export const asset = v.union(
  v.object({
    kind: v.literal("external"),
    url: v.string(),
    purpose: v.union(
      v.literal("image"),
      v.literal("screenshot"),
      v.literal("thumbnail"),
    ),
  }),
  v.object({
    kind: v.literal("stored"),
    storageId: v.id("_storage"),
    purpose: v.union(
      v.literal("image"),
      v.literal("screenshot"),
      v.literal("thumbnail"),
    ),
  }),
);
export const itemFields = {
  ownerId: v.string(),
  captureKey: v.string(),
  captureSource,
  inputType,
  originalInput: v.string(),
  originalUrl: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  captureStatus: v.literal("captured"),
  enrichmentStatus: v.union(
    v.literal("not_started"),
    v.literal("pending"),
    v.literal("succeeded"),
    v.literal("failed"),
  ),
  sourceMetadata: v.optional(
    v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      author: v.optional(v.string()),
      siteName: v.optional(v.string()),
    }),
  ),
  extractedText: v.optional(v.string()),
  imageAssets: v.array(asset),
  updatedAt: v.number(),
  pendingEnrichmentRunId: v.optional(v.id("processingRuns")),
};
export const itemDoc = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  ...itemFields,
});
export const itemPreview = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  inputType,
  originalInput: v.string(),
  sourceMetadata: v.optional(v.object({ title: v.optional(v.string()) })),
  enrichmentStatus: itemFields.enrichmentStatus,
  captureSource,
  originalUrl: v.optional(v.string()),
  labels: v.array(v.object({ _id: v.id("labels"), name: v.string() })),
  labelCount: v.number(),
});
export const itemDetail = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  inputType,
  originalInput: v.string(),
  originalUrl: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  captureSource,
  enrichmentStatus: itemFields.enrichmentStatus,
  sourceMetadata: itemFields.sourceMetadata,
});
export const itemPage = paginationResultValidator(itemPreview);
export const labelFields = {
  ownerId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
};
export const labelDoc = v.object({
  _id: v.id("labels"),
  _creationTime: v.number(),
  ...labelFields,
});
export const sourceMetadata = itemFields.sourceMetadata;
export const enrichment = v.object({
  canonicalUrl: v.optional(v.string()),
  sourceMetadata,
  extractedText: v.optional(v.string()),
  imageAssets: v.optional(v.array(asset)),
});
export const suggestion = v.object({
  labelId: v.id("labels"),
  confidence: v.optional(v.number()),
});
export const runFields = {
  ownerId: v.string(),
  itemId: v.id("items"),
  kind: v.union(v.literal("enrichment"), v.literal("decision")),
  status: v.union(
    v.literal("pending"),
    v.literal("succeeded"),
    v.literal("failed"),
  ),
  provider: v.optional(
    v.union(
      v.literal("jev"),
      v.literal("clef"),
      v.literal("clef-flash"),
      v.literal("openai-decisions"),
    ),
  ),
  model: v.optional(v.string()),
  modality: v.union(
    v.literal("text"),
    v.literal("image"),
    v.literal("text_image"),
  ),
  questionVersion: v.string(),
  rubricVersion: v.optional(v.string()),
  suggestions: v.array(suggestion),
  category: v.optional(v.string()),
  rankingScore: v.optional(v.number()),
  error: v.optional(v.string()),
  latencyMs: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
};
export const runDoc = v.object({
  _id: v.id("processingRuns"),
  _creationTime: v.number(),
  ...runFields,
});
export { paginationOptsValidator };

export function validatePagination(opts: { numItems: number }) {
  if (
    !Number.isInteger(opts.numItems) ||
    opts.numItems < 1 ||
    opts.numItems > 100
  ) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Page size must be between 1 and 100",
    });
  }
}

export function validateCapture(input: {
  inputType: "url" | "text";
  originalInput: string;
  captureKey: string;
}) {
  const limit = input.inputType === "url" ? 8192 : 100000;
  if (
    !input.originalInput.trim() ||
    input.originalInput.length > limit ||
    !input.captureKey.trim() ||
    input.captureKey.length > 128
  ) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid input" });
  }
  if (input.inputType === "url") validateUrl(input.originalInput);
}

export function validateUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid URL" });
  }
  if (
    value.length > 8192 ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid URL" });
  }
}
