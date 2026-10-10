import type { ShareRef } from "../share/parseShare";

export type { ShareRef };

export type ResolvedPost = {
  id: string;
  handle: string;
  /** Display name of the author. */
  author: string;
  /** Full text of the outer post, trimmed. */
  text: string;
  /** https image URLs of the post's own photos, or its video poster. */
  images: string[];
};

export type ResolverDeps = { fetch: typeof fetch; timeoutMs?: number };
