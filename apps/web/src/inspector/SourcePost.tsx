import { BrandIcon } from "../library/BrandIcon";
import { SectionHeading } from "./Facts";
import type { ItemDetail } from "./types";

/** The retained source context links to the original post; hidden snapshots have no normal detail. */
export function SourcePost({
  post,
}: {
  post: NonNullable<ItemDetail["fromPost"]>;
}) {
  return (
    <section aria-labelledby="source-post" className="flex flex-col gap-2">
      <SectionHeading id="source-post">Found in post</SectionHeading>
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex flex-col gap-1 border p-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <BrandIcon host="x.com" kind="link" />
          <span className="truncate font-medium">{post.title ?? post.url}</span>
        </span>
        {post.excerpt && (
          <span className="line-clamp-3 break-words whitespace-pre-wrap text-muted-foreground">
            {post.excerpt}
          </span>
        )}
      </a>
    </section>
  );
}
