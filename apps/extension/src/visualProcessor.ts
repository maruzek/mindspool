import { browser } from "wxt/browser";
import { VISUAL_LIMITS } from "@mindspool/schema";
import { pixelCrop } from "./regionCapture";
import { rasterDimensions } from "./imageCapture";
import {
  captureFailure,
  type EncodedCapture,
  type ProcessorRequest,
} from "./visualCapture";

function pngDimensions(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/png;base64,"))
    throw new Error("image_unavailable");
  const header = Uint8Array.from(atob(dataUrl.slice(22, 66)), (char) =>
    char.charCodeAt(0),
  );
  if (header.length < 24) throw new Error("image_unavailable");
  const view = new DataView(header.buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > VISUAL_LIMITS.edge ||
    height > VISUAL_LIMITS.edge ||
    width * height > VISUAL_LIMITS.pixels
  )
    throw new Error("too_large");
  return { width, height };
}
function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("image_unavailable"));
    reader.readAsDataURL(blob);
  });
}
async function processVisual(
  request: ProcessorRequest,
): Promise<EncodedCapture> {
  const blob = await (await fetch(request.dataUrl)).blob();
  const dimensions = request.sourceImage
    ? rasterDimensions(new Uint8Array(await blob.arrayBuffer()))
    : pngDimensions(request.dataUrl);
  const bitmap = await createImageBitmap(blob);
  const { width, height } = request.sourceImage ? bitmap : dimensions;
  const canvas = document.createElement("canvas");
  try {
    const crop = request.crop
      ? pixelCrop(
          request.crop,
          width,
          height,
          request.cssWidth,
          request.cssHeight,
        )
      : { left: 0, top: 0, width, height };
    if (
      bitmap.width !== width ||
      bitmap.height !== height ||
      bitmap.width * bitmap.height > VISUAL_LIMITS.pixels
    )
      throw new Error("image_unavailable");
    for (const scale of [1, 0.85, 0.7]) {
      canvas.width = Math.round(crop.width * scale);
      canvas.height = Math.round(crop.height * scale);
      const floor = request.sourceImage
        ? Math.min(1, 1280 / Math.max(width, height))
        : undefined;
      if (
        canvas.width <
          (floor
            ? Math.floor(width * floor)
            : (request.crop?.width ?? request.cssWidth)) ||
        canvas.height <
          (floor
            ? Math.floor(height * floor)
            : (request.crop?.height ?? request.cssHeight))
      )
        continue;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("image_unavailable");
      context.drawImage(
        bitmap,
        crop.left,
        crop.top,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      for (const quality of [0.9, 0.82, 0.74]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality),
        );
        if (
          !blob ||
          !["image/webp", "image/png", "image/jpeg"].includes(blob.type)
        )
          throw new Error("image_unavailable");
        if (blob.size <= VISUAL_LIMITS.bytes)
          return {
            dataUrl: await dataUrl(blob),
            width: canvas.width,
            height: canvas.height,
            bytes: blob.size,
            contentType: blob.type as EncodedCapture["contentType"],
          };
        if (blob.type !== "image/webp") break;
      }
    }
    throw new Error("too_large");
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (
    sender.id !== browser.runtime.id ||
    !sender.url?.startsWith(browser.runtime.getURL("/")) ||
    !message ||
    typeof message !== "object" ||
    !("target" in message) ||
    message.target !== "visual-processor"
  )
    return undefined;
  const request = message as ProcessorRequest;
  if (
    typeof request.dataUrl !== "string" ||
    !Number.isFinite(request.cssWidth) ||
    !Number.isFinite(request.cssHeight) ||
    request.cssWidth <= 0 ||
    request.cssHeight <= 0
  )
    return Promise.resolve({ ok: false, reason: "image_unavailable" });
  return processVisual(request).then(
    (visual) => ({ ok: true, visual }),
    (error) => ({ ok: false, reason: captureFailure(error) }),
  );
});
