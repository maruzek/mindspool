import { safeVisualUrl, VISUAL_LIMITS } from "@mindspool/schema";
export type ImageTarget = {
  tabId: number;
  windowId: number;
  pageUrl: string;
  srcUrl: string;
  frameId?: number;
  targetElementId?: number;
};
export type ImageSource = {
  dataUrl: string;
  width: number;
  height: number;
  isAnimationStill: boolean;
  entryUrl?: string;
  designSiteUrl?: string;
};
export function rasterDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  let width = 0,
    height = 0,
    contentType = "",
    isAnimationStill = false;
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 4) === "PNG") {
    width = view.getUint32(16);
    height = view.getUint32(20);
    contentType = "image/png";
    for (let offset = 8; offset + 12 <= bytes.length;) {
      if (ascii(offset + 4, offset + 8) === "acTL") isAnimationStill = true;
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) break;
      offset += 12 + length;
    }
  } else if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) {
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
    contentType = "image/gif";
    isAnimationStill = true;
  } else if (
    bytes.length >= 30 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP"
  ) {
    contentType = "image/webp";
    if (ascii(12, 16) === "VP8X") {
      width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
      isAnimationStill = Boolean(bytes[20]! & 2);
    } else if (ascii(12, 16) === "VP8L") {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (ascii(12, 16) === "VP8 ") {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    }
  } else if (bytes.length > 10 && bytes[0] === 255 && bytes[1] === 216) {
    contentType = "image/jpeg";
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1]!;
      if (marker === 255) {
        offset++;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = view.getUint16(offset + 5);
        width = view.getUint16(offset + 7);
        break;
      }
      offset += 2 + length;
    }
  }
  if (!width || !height) throw new Error("image_unavailable");
  if (
    width > VISUAL_LIMITS.edge ||
    height > VISUAL_LIMITS.edge ||
    width * height > VISUAL_LIMITS.pixels
  )
    throw new Error("too_large");
  return { width, height, contentType, isAnimationStill };
}
export async function downloadImage(
  source: string,
  allowed: (origin: string) => Promise<boolean>,
  fetchImage: typeof fetch = fetch,
): Promise<ImageSource> {
  if (!safeVisualUrl(source)) throw new Error("image_unavailable");
  let url = source;
  const signal = AbortSignal.timeout(10_000);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!(await allowed(new URL(url).origin)))
      throw new Error(redirect ? "image_unavailable" : "permission_denied");
    const response = await fetchImage(url, {
      credentials: "omit",
      redirect: "manual",
      signal,
    });
    if (response.type === "opaqueredirect")
      throw new Error("image_unavailable");
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) throw new Error("image_unavailable");
      url = new URL(location, url).href;
      if (!safeVisualUrl(url)) throw new Error("image_unavailable");
      continue;
    }
    if (!response.ok || !response.body) throw new Error("image_unavailable");
    if (
      Number(response.headers.get("Content-Length")) > VISUAL_LIMITS.sourceBytes
    )
      throw new Error("too_large");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > VISUAL_LIMITS.sourceBytes) throw new Error("too_large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const metadata = rasterDimensions(bytes);
    let binary = "";
    for (let n = 0; n < bytes.length; n += 32_768)
      binary += String.fromCharCode(...bytes.subarray(n, n + 32_768));
    return {
      ...metadata,
      dataUrl: `data:${metadata.contentType};base64,${btoa(binary)}`,
    };
  }
  throw new Error("image_unavailable");
}
/** Same-document target resolution; duplicate URLs never borrow another card's context. */
export function selectedImageContext(
  srcUrl: string,
  targetElementId?: number,
): Partial<ImageSource> {
  const api = (
    globalThis as typeof globalThis & {
      browser?: { menus?: { getTargetElement(id: number): Element } };
    }
  ).browser;
  const target =
    targetElementId === undefined
      ? undefined
      : api?.menus?.getTargetElement(targetElementId);
  const matches = Array.from(document.images).filter(
    (image) => image.currentSrc === srcUrl || image.src === srcUrl,
  );
  const image =
    target instanceof HTMLImageElement &&
    (target.currentSrc === srcUrl || target.src === srcUrl)
      ? target
      : matches.length === 1
        ? matches[0]
        : undefined;
  if (!image) return {};
  const context: Partial<ImageSource> = {};
  const scope = image.closest("article,li,[data-entry]") ?? image.parentElement;
  const links = Array.from(
    scope?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
  )
    .map((link) => link.href)
    .filter(
      (url) =>
        /^https?:\/\//.test(url) &&
        !new URL(url).username &&
        !new URL(url).password &&
        url.length <= 8192 &&
        url !== srcUrl &&
        !/\.(png|jpe?g|gif|webp)([?#]|$)/i.test(url),
    );
  const unique = [...new Set(links)];
  const local = unique.filter((url) => new URL(url).origin === location.origin);
  const external = unique.filter(
    (url) => new URL(url).origin !== location.origin,
  );
  const xPostUrls = [
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
  ].includes(location.hostname)
    ? [
        ...new Set(
          local.flatMap((url) => {
            const parsed = new URL(url);
            const post = parsed.pathname.match(
              /^\/[^/]+\/status\/\d+(?=\/|$)/,
            )?.[0];
            return post ? [`${parsed.origin}${post}`] : [];
          }),
        ),
      ]
    : [];
  if (xPostUrls.length === 1) context.entryUrl = xPostUrls[0];
  else if (local.length === 1) context.entryUrl = local[0];
  if (external.length === 1) context.designSiteUrl = external[0];
  if (
    image.naturalWidth &&
    image.naturalHeight &&
    image.naturalWidth * image.naturalHeight <= 24_000_000 &&
    Math.max(image.naturalWidth, image.naturalHeight) <= 32_000
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    try {
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      context.dataUrl = canvas.toDataURL("image/png");
      context.width = canvas.width;
      context.height = canvas.height;
      context.isAnimationStill = true;
    } catch {
      /* Tainted images require an extension-origin download with permission. */
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  return context;
}
