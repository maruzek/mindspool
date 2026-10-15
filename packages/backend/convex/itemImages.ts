import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * The item's images in display order, as safe `http(s)` URLs. Clip images come
 * first; a page's thumbnail (og:image) is used only when the clip has none.
 */
export async function imageUrls(
  ctx: QueryCtx,
  item: Pick<Doc<"items">, "imageAssets">,
  limit: number,
) {
  const images = item.imageAssets.filter((a) => a.purpose !== "thumbnail");
  const assets = images.length
    ? images
    : item.imageAssets.filter((a) => a.purpose === "thumbnail");
  const urls: string[] = [];
  for (const asset of assets) {
    if (urls.length >= limit) break;
    const url =
      asset.kind === "stored"
        ? await ctx.storage.getUrl(asset.storageId)
        : asset.url;
    if (url && /^https?:\/\//i.test(url)) urls.push(url);
  }
  return urls;
}
