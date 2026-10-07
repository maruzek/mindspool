import { relativeDate } from "../library/itemDisplay";
import { SOURCES } from "../library/ItemList";
import type { PreviewItem } from "../library/types";

/** "Saved 4m ago from browser extension"; a short date after seven days. */
export function savedLine(
  item: { _creationTime: number; captureSource: PreviewItem["captureSource"] },
  now = Date.now(),
): string {
  const when = relativeDate(item._creationTime, now);
  const phrase =
    when === "now"
      ? "just now"
      : /^\d+[mhd]$/.test(when)
        ? `${when} ago`
        : when;
  return `Saved ${phrase} from ${SOURCES[item.captureSource]}`;
}
