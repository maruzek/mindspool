import { ExternalLink } from "lucide-react";
import { Button } from "@mindspool/ui/components/button";
import { SourceIcon } from "../library/BrandIcon";
import { SOURCES, SOURCE_LABELS } from "../search/searchParams";
import type { Source } from "../search/searchParams";
export function CardSource({ source }: { source: string }) {
  const kind: Source = SOURCES.includes(source as Source)
    ? (source as Source)
    : "web";
  return (
    <span
      role="img"
      aria-label={SOURCE_LABELS[kind]}
      title={SOURCE_LABELS[kind]}
      className="inline-flex text-muted-foreground"
    >
      <SourceIcon source={kind} className="size-3.5" />
    </span>
  );
}
export function SourceLink({ url }: { url?: string | null }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <Button
      nativeButton={false}
      role="link"
      render={<a href={url} target="_blank" rel="noopener noreferrer" />}
      aria-label="Open original link in new tab"
      title="Open original link in new tab"
      variant="ghost"
      size="icon-sm"
      className="nodrag nopan"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ExternalLink />
    </Button>
  );
}
