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
};
export const itemDoc = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  ...itemFields,
});
export const itemPage = paginationResultValidator(itemDoc);
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
