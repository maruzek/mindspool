import { BrandIcon } from "../library/BrandIcon";
import { ItemLink } from "../library/ItemList";
import type { ItemDetail } from "./types";

/** The post a link was found in; opens that post in the inspector. */
export function SourcePost({
  post,
}: {
  post: NonNullable<ItemDetail["fromPost"]>;
}) {
  return (
    <section aria-labelledby="source-post" className="flex flex-col gap-2">
      <h3 id="source-post" className="text-xs text-muted-foreground">
        Found in post
      </h3>
      <ItemLink
        itemId={post._id}
        selected={false}
        className="relative flex flex-col gap-1 border p-3 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
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
      </ItemLink>
    </section>
  );
}
