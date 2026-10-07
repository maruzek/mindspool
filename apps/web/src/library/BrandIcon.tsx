import { Globe, StickyNote } from "lucide-react";
import { brandOf } from "./itemDisplay";
import type { BrandKey, ItemKind } from "./itemDisplay";
import type { Source } from "../search/searchParams";
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

const SOURCE_BRANDS: Partial<Record<Source, BrandKey>> = {
  x: "x",
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  reddit: "reddit",
};

/** The icon for a filter source: its brand mark, a globe for the web, a note for notes. */
export function SourceIcon({
  source,
  className = "size-4",
}: {
  source: Source;
  className?: string;
}) {
  const brand = SOURCE_BRANDS[source];
  if (brand)
    return (
      <BrandIcon host={`${brand}.com`} kind="link" className={className} />
    );
  return source === "note" ? (
    <StickyNote aria-hidden="true" className={className} />
  ) : (
    <Globe aria-hidden="true" className={className} />
  );
}
