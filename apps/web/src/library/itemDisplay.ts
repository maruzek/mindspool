export type CaptureType = "url" | "text";
export type ItemKind = "link" | "note";
export type BrandKey = "x" | "instagram" | "tiktok" | "youtube" | "reddit";

export const CAPTURE_LIMITS: Record<CaptureType, number> = {
  url: 8192,
  text: 100_000,
};

/**
 * Decides link versus note from what the user typed. Only the decision uses the
 * trimmed value; callers must store the original input untouched.
 */
export function captureTypeOf(input: string): CaptureType {
  const value = input.trim();
  if (!value || /\s/.test(value)) return "text";
  try {
    const url = new URL(value);
    const web = url.protocol === "http:" || url.protocol === "https:";
    return web && !url.username && !url.password ? "url" : "text";
  } catch {
    return "text";
  }
}

export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const BRAND_HOSTS: [BrandKey, string[]][] = [
  ["x", ["x.com", "twitter.com"]],
  ["instagram", ["instagram.com"]],
  ["tiktok", ["tiktok.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["reddit", ["reddit.com", "redd.it"]],
];

export function brandOf(host: string | null): BrandKey | null {
  if (!host) return null;
  for (const [key, hosts] of BRAND_HOSTS)
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return key;
  return null;
}

export interface DisplayableItem {
  inputType: CaptureType;
  originalInput: string;
  originalUrl?: string;
  sourceMetadata?: { title?: string };
}

export function kindOf(item: Pick<DisplayableItem, "inputType">): ItemKind {
  return item.inputType === "url" ? "link" : "note";
}

export function hostOfItem(item: DisplayableItem): string | null {
  return item.inputType === "url"
    ? hostOf(item.originalUrl ?? item.originalInput)
    : null;
}

export function displayTitle(item: DisplayableItem): string {
  const title = item.sourceMetadata?.title?.trim();
  if (title) return title;
  if (item.inputType === "url") {
    const raw = (item.originalUrl ?? item.originalInput).trim();
    const host = hostOf(raw);
    if (host) {
      const path = new URL(raw).pathname;
      return path === "/" ? host : `${host}${path}`;
    }
    return raw;
  }
  return (
    item.originalInput
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "4m", "2h", "3d", then a short date. `now` is injectable for tests. */
export function relativeDate(createdAt: number, now = Date.now()): string {
  const age = now - createdAt;
  if (age < MINUTE) return "now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  if (age < 7 * DAY) return `${Math.floor(age / DAY)}d`;
  const date = new Date(createdAt);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
