// Pure, deterministic excerpt selection for compact summaries. No imports, so
// Convex query modules can use it without pulling in the MCP server.

export const EXCERPT_UNITS = 160;
const LEAD_UNITS = 40;
// Matches are only sought near the start of very long text: the search index
// itself works on a bounded projection, and this keeps CPU per row bounded.
const SCAN_UNITS = 100_000;

export type Excerpt = { text: string; truncated: boolean };

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Lowercases per code point, keeping a code point unchanged when lowercasing
 * would change its length, so indices in the result are valid in the original.
 */
function foldLength(text: string) {
  let folded = "";
  for (const char of text) {
    const lower = char.toLowerCase();
    folded += lower.length === char.length ? lower : char;
  }
  return folded;
}

/** Whitespace-separated query terms, de-duplicated case-insensitively, in query order. */
export function queryTerms(query: string) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of query.trim().split(/\s+/)) {
    const folded = foldLength(term);
    if (!folded || seen.has(folded)) continue;
    seen.add(folded);
    terms.push(folded);
  }
  return terms;
}

function windowAt(flat: string, from: number): Excerpt {
  let start = from;
  if (start > 0 && isLow(flat.charCodeAt(start))) start--;
  let end = Math.min(flat.length, start + EXCERPT_UNITS);
  if (end < flat.length && isHigh(flat.charCodeAt(end - 1))) end--;
  return {
    text: flat.slice(start, end).trim(),
    truncated:
      flat.slice(0, start).trim() !== "" || flat.slice(end).trim() !== "",
  };
}

/** The start of the text, whitespace collapsed; undefined when it has no text. */
export function leadingExcerpt(text: string | undefined): Excerpt | undefined {
  const flat = collapse(text ?? "");
  return flat ? windowAt(flat, 0) : undefined;
}

/**
 * A passage around the earliest literal match of any term (ties resolved by
 * query order); undefined when none occurs in the text.
 */
export function matchExcerpt(
  text: string | undefined,
  terms: readonly string[],
): Excerpt | undefined {
  const flat = collapse(text ?? "");
  if (!flat || !terms.length) return undefined;
  const folded = foldLength(flat.slice(0, SCAN_UNITS));
  let best = -1;
  for (const term of terms) {
    const at = folded.indexOf(term);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best === -1
    ? undefined
    : windowAt(flat, Math.max(0, best - LEAD_UNITS));
}

/** Cuts a title at a code-point boundary; reports whether anything was removed. */
export function clipTitle(title: string, max: number) {
  if (title.length <= max) return { text: title, truncated: false };
  const end = isHigh(title.charCodeAt(max - 1)) ? max - 1 : max;
  return { text: title.slice(0, end), truncated: true };
}
