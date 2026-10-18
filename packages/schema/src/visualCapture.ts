/** Inclusive limits shared by the trusted extension and server boundary. */
export const VISUAL_LIMITS = {
  bytes: 2_097_152,
  sourceBytes: 16 * 1024 * 1024,
  pixels: 24_000_000,
  edge: 32_000,
  tiles: 40,
  durationMs: 30_000,
  screenshotIntervalMs: 600,
  lifetimeMs: 3_600_000,
  metadata: { title: 300, description: 1000, author: 300, siteName: 300 },
} as const;
export type VisualCaptureKind = "viewport" | "region" | "full-page" | "image";
export type CaptureContext = {
  captureKey: string;
  kind: VisualCaptureKind;
  pageUrl: string;
  capturedAt: number;
  sourceMetadata?: Partial<Record<keyof typeof VISUAL_LIMITS.metadata, string>>;
  canonicalUrl?: string;
  previewImageUrl?: string;
  sourceImageUrl?: string;
  entryUrl?: string;
  designSiteUrl?: string;
  isAnimationStill?: boolean;
};
export type EncodedVisual = {
  blob: Blob;
  width: number;
  height: number;
  contentType: "image/png" | "image/jpeg" | "image/webp";
};
export function safeVisualUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value.length <= 8192 &&
      !/[\u0000-\u0020\u007f]/.test(value) &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function assertCaptureContext(
  value: unknown,
): asserts value is CaptureContext {
  if (!value || typeof value !== "object")
    throw new Error("Invalid capture context");
  const context = value as CaptureContext;
  if (
    !/^visual:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      context.captureKey,
    ) ||
    !["viewport", "region", "full-page", "image"].includes(context.kind) ||
    !Number.isSafeInteger(context.capturedAt) ||
    context.capturedAt < 0 ||
    context.capturedAt > Date.now() + 300_000
  )
    throw new Error("Invalid capture context");
  for (const field of [
    "pageUrl",
    "canonicalUrl",
    "previewImageUrl",
    "sourceImageUrl",
    "entryUrl",
    "designSiteUrl",
  ] as const) {
    const url = context[field];
    if (
      (field === "pageUrl" || url !== undefined) &&
      (typeof url !== "string" || !safeVisualUrl(url))
    )
      throw new Error("Invalid capture URL");
  }
  if (context.sourceMetadata !== undefined) {
    if (!context.sourceMetadata || typeof context.sourceMetadata !== "object")
      throw new Error("Invalid metadata");
    for (const [key, text] of Object.entries(context.sourceMetadata)) {
      const limit =
        VISUAL_LIMITS.metadata[key as keyof typeof VISUAL_LIMITS.metadata];
      if (!limit || typeof text !== "string" || text.length > limit)
        throw new Error("Invalid metadata");
    }
  }
  if (
    context.isAnimationStill !== undefined &&
    typeof context.isAnimationStill !== "boolean"
  )
    throw new Error("Invalid animation flag");
}
/** Stable across object key ordering and omitted optional values. */
export function captureContextFingerprint(context: CaptureContext): string {
  return JSON.stringify(context, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}
