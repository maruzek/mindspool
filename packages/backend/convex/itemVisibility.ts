/** Missing role is the legacy and current normal-library representation. */
export type LibraryRole = "tweet_pending" | "tweet_source";
type RoleItem = { libraryRole?: LibraryRole };

export function isNormalItem(item: RoleItem): boolean {
  return item.libraryRole === undefined;
}

export function isTweetSource(item: RoleItem): boolean {
  return item.libraryRole === "tweet_source";
}

export function isTweetPending(item: RoleItem): boolean {
  return item.libraryRole === "tweet_pending";
}

/** Every counter path uses the same zero contribution for hidden snapshots. */
export function itemContribution(item: RoleItem & { inbox?: boolean; needsReview?: boolean }) {
  return {
    total: Number(isNormalItem(item)),
    inbox: Number(isNormalItem(item) && !!item.inbox),
    needsReview: Number(isNormalItem(item) && !!item.needsReview),
  };
}
