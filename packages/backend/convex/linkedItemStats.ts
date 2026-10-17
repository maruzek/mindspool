import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/** Same transaction as the child write; never changes a foreign parent's count. */
export async function changeLinkedItemStats(
  ctx: MutationCtx,
  ownerId: string,
  parentId: Id<"items">,
  delta: 1 | -1,
) {
  const parent = await ctx.db.get(parentId);
  if (!parent || parent.ownerId !== ownerId) return;
  const previous = parent.linkedItemStats;
  await ctx.db.patch(parentId, {
    linkedItemStats: {
      revision: (previous?.revision ?? 0) + 1,
      ...(previous?.count !== undefined
        ? { count: Math.max(0, previous.count + delta) }
        : {}),
    },
  });
}
