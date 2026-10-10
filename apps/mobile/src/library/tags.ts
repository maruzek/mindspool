import type { PreviewItem } from "./types";

export type TagState = "confirmed" | "suggested" | "manual";

export type Tag = {
  key: string;
  text: string;
  state: TagState;
  /** The tag stands for a running labeling run. */
  busy?: boolean;
};

export const SOURCES: Record<PreviewItem["captureSource"], string> = {
  web: "web",
  mobile: "mobile app",
  extension: "browser extension",
};

/** Same tags and order as the web list: `Labeling…`, labels (unsure as suggested), `+N`. */
export function tagsOf(
  item: Pick<PreviewItem, "labels" | "labelCount" | "labeling">,
): Tag[] {
  const tags: Tag[] = [];
  if (item.labeling)
    tags.push({
      key: "labeling",
      text: "Labeling…",
      state: "manual",
      busy: true,
    });
  for (const label of item.labels)
    tags.push({
      key: label._id,
      text: label.name,
      state: label.unsure ? "suggested" : "confirmed",
    });
  const extra = item.labelCount - item.labels.length;
  if (extra > 0)
    tags.push({ key: "extra", text: `+${extra}`, state: "manual" });
  return tags;
}
