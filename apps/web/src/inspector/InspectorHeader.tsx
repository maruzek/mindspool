import { XIcon } from "lucide-react";
import { Button, buttonVariants } from "@mindspool/ui/components/button";
import { SidebarHeader } from "@mindspool/ui/components/sidebar";
import { BrandIcon } from "../library/BrandIcon";
import { hostOfItem, kindOf } from "../library/itemDisplay";
import type { DisplayableItem } from "../library/itemDisplay";

function webUrl(item: DisplayableItem): string | null {
  if (item.inputType !== "url") return null;
  const raw = (item.originalUrl ?? item.originalInput).trim();
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/** Source on the left; "Open original" (links only) and Close on the right. */
export function InspectorHeader({
  item,
  onClose,
}: {
  item?: DisplayableItem;
  onClose: () => void;
}) {
  const url = item ? webUrl(item) : null;
  return (
    <SidebarHeader className="flex-row items-center gap-2 border-b-2 border-border">
      {item && (
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
          <BrandIcon host={hostOfItem(item)} kind={kindOf(item)} />
          <span className="truncate">
            {kindOf(item) === "note" ? "note" : (hostOfItem(item) ?? "link")}
          </span>
        </span>
      )}
      {!item && <span className="flex-1" />}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original (new tab)"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Open original
        </a>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onClick={onClose}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </SidebarHeader>
  );
}
