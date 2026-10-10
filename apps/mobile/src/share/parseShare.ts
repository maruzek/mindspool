export type ShareRef = { id: string; handle: string };

export type ParsedShare =
  { kind: "x"; ref: ShareRef } | { kind: "unsupported" };

const X_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "fxtwitter.com",
  "vxtwitter.com",
  "fixupx.com",
  "fixvx.com",
]);

const SUBDOMAINS = new Set(["www", "mobile", "m"]);

const STATUS_PATH =
  /^\/(?:i\/web|i|[A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:\/|$)/;
const HANDLE_PATH = /^\/([A-Za-z0-9_]{1,15})\//;

function isXHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (X_HOSTS.has(host)) return true;
  const [first, ...rest] = host.split(".");
  return SUBDOMAINS.has(first ?? "") && X_HOSTS.has(rest.join("."));
}

function refOf(candidate: string): ShareRef | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!isXHost(url.hostname)) return null;
  const match = STATUS_PATH.exec(url.pathname);
  if (!match) return null;
  const handle = HANDLE_PATH.exec(url.pathname)?.[1];
  return { id: match[1] as string, handle: handle ?? "i" };
}

/**
 * Finds the first X post link in the text of a share. The X app shares just
 * the link, but other apps add words around it.
 */
export function parseShare(text: string): ParsedShare {
  for (const token of text.split(/\s+/)) {
    const candidate = token.replace(/^[("'<]+|[)"'>.,;!?]+$/g, "");
    if (!/^https?:\/\//i.test(candidate)) continue;
    const ref = refOf(candidate);
    if (ref) return { kind: "x", ref };
  }
  return { kind: "unsupported" };
}
