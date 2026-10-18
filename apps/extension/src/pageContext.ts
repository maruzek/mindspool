import { parseMetadata } from "../../../packages/backend/convex/pageMetadata";
import { VISUAL_LIMITS, type CaptureContext } from "@mindspool/schema";

/** Serialized as an isolated-world helper. Keep all dependencies inside it. */
export function readRenderedPage(seed?: string) {
  const scope = globalThis as typeof globalThis & {
    __mindspoolDocumentId?: string;
  };
  scope.__mindspoolDocumentId ??= seed ?? crypto.randomUUID();
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  let head = `<title>${escape(document.title.slice(0, 500))}</title>`;
  const allowed =
    /^(og:(title|description|image|site_name)|twitter:(title|description|image)|description|author|article:author)$/;
  for (const element of Array.from(
    document.head.querySelectorAll("meta,link[rel='canonical']"),
  ).slice(0, 128)) {
    const key =
      element.getAttribute("property") ?? element.getAttribute("name") ?? "";
    const part =
      element.tagName === "LINK"
        ? `<link rel="canonical" href="${escape((element.getAttribute("href") ?? "").slice(0, 2048))}">`
        : allowed.test(key)
          ? `<meta property="${escape(key)}" name="${escape(key)}" content="${escape((element.getAttribute("content") ?? "").slice(0, 2048))}">`
          : "";
    if (head.length + part.length > 32_768) break;
    head += part;
  }
  return {
    documentId: scope.__mindspoolDocumentId,
    pageUrl: location.href,
    title: document.title.slice(0, 300),
    head,
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  };
}
export function pageContext(
  pageUrl: string,
  head: string,
): Pick<CaptureContext, "sourceMetadata" | "canonicalUrl" | "previewImageUrl"> {
  const metadata = parseMetadata(head, pageUrl);
  const sourceMetadata: NonNullable<CaptureContext["sourceMetadata"]> = {};
  for (const key of ["title", "description", "author", "siteName"] as const) {
    if (metadata[key])
      sourceMetadata[key] = metadata[key].slice(0, VISUAL_LIMITS.metadata[key]);
  }
  return {
    ...(Object.keys(sourceMetadata).length ? { sourceMetadata } : {}),
    ...(metadata.canonicalUrl ? { canonicalUrl: metadata.canonicalUrl } : {}),
    ...(metadata.image ? { previewImageUrl: metadata.image } : {}),
  };
}
