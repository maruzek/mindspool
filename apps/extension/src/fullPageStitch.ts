import { VISUAL_LIMITS } from "@mindspool/schema";
import { rasterDimensions } from "./imageCapture";
import type { FullPageVisual } from "./fullPageCapture";
export function stitchGeometry(
  tiles: { width: number; height: number; y: number }[],
  cssWidth: number,
  cssHeight: number,
  viewportHeight: number,
) {
  const first = tiles[0];
  if (
    !first ||
    tiles.length > VISUAL_LIMITS.tiles ||
    cssWidth <= 0 ||
    cssHeight <= 0 ||
    viewportHeight <= 0
  )
    throw new Error("image_unavailable");
  const width = first.width,
    scale = first.height / viewportHeight,
    height = Math.round(cssHeight * scale);
  if (
    !Number.isFinite(width * height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > VISUAL_LIMITS.pixels ||
    Math.max(width, height) > VISUAL_LIMITS.edge
  )
    throw new Error("too_large");
  let covered = 0,
    previous = -1;
  const placements = tiles.map((tile, index) => {
    const y = Math.round(tile.y * scale);
    if (
      tile.width !== width ||
      !Number.isFinite(y) ||
      y < 0 ||
      y > covered ||
      tile.y <= previous ||
      (!index && y !== 0)
    )
      throw new Error("page_changed");
    previous = tile.y;
    const sourceY = covered - y;
    const added = Math.min(tile.height - sourceY, height - covered);
    if (added <= 0) throw new Error("page_changed");
    const placement = { sourceY, destinationY: covered, height: added };
    covered += added;
    return placement;
  });
  if (covered !== height) throw new Error("image_unavailable");
  return { width, height, placements };
}
export async function stitchFullPage(
  source: FullPageVisual,
  viewportHeight: number,
) {
  const metadata = source.tiles.map((tile) => {
    if (!tile.dataUrl.startsWith("data:image/png;base64,"))
      throw new Error("image_unavailable");
    return {
      ...rasterDimensions(
        Uint8Array.from(atob(tile.dataUrl.slice(22, 66)), (char) =>
          char.charCodeAt(0),
        ),
      ),
      y: tile.y,
    };
  });
  const geometry = stitchGeometry(
    metadata,
    source.cssWidth,
    source.cssHeight,
    viewportHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image_unavailable");
  try {
    for (let index = 0; index < source.tiles.length; index++) {
      const tile = source.tiles[index]!,
        placement = geometry.placements[index]!;
      const bitmap = await createImageBitmap(
        await (await fetch(tile.dataUrl)).blob(),
      );
      try {
        if (
          bitmap.width !== metadata[index]!.width ||
          bitmap.height !== metadata[index]!.height
        )
          throw new Error("image_unavailable");
        context.drawImage(
          bitmap,
          0,
          placement.sourceY,
          bitmap.width,
          placement.height,
          0,
          placement.destinationY,
          bitmap.width,
          placement.height,
        );
      } finally {
        bitmap.close();
        tile.dataUrl = "";
      }
    }
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}
