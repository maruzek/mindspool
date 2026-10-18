import { browser } from "wxt/browser";
import { VISUAL_LIMITS } from "@mindspool/schema";
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
  const { width, height } = pngDimensions(request.dataUrl);
  const bitmap = await createImageBitmap(
    await (await fetch(request.dataUrl)).blob(),
  );
  const canvas = document.createElement("canvas");
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new Error("image_unavailable");
    for (const scale of [1, 0.85, 0.7]) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      if (canvas.width < request.cssWidth || canvas.height < request.cssHeight)
        continue;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("image_unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
