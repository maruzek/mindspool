import { Globe, StickyNote } from "lucide-react";
import { brandOf } from "./itemDisplay";
import type { BrandKey, ItemKind } from "./itemDisplay";
import instagram from "../assets/brands/instagram.svg?raw";
import reddit from "../assets/brands/reddit.svg?raw";
import tiktok from "../assets/brands/tiktok.svg?raw";
import x from "../assets/brands/x.svg?raw";
import youtube from "../assets/brands/youtube.svg?raw";

// The supplied SVGs are single-path Simple Icons marks; reuse their path data
// so the icon can follow `currentColor` without a loader or dependency.
const PATHS: Record<BrandKey, string> = Object.fromEntries(
  Object.entries({ instagram, reddit, tiktok, x, youtube }).map(
    ([key, svg]) => [key, /<path d="([^"]+)"/.exec(svg)?.[1] ?? ""],
  ),
) as Record<BrandKey, string>;

export function BrandIcon({
  host,
  kind,
  className = "size-4",
}: {
  host: string | null;
  kind: ItemKind;
  className?: string;
}) {
  if (kind === "note")
    return <StickyNote aria-hidden="true" className={className} />;
  const brand = brandOf(host);
  if (!brand) return <Globe aria-hidden="true" className={className} />;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      data-brand={brand}
    >
      <path d={PATHS[brand]} />
    </svg>
  );
}
