import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Skeleton } from "@mindspool/ui/components/skeleton";
import { validateLibrarySearch } from "../../library/search";
import { LibraryView } from "../../library/LibraryView";
import { PAGE_SIZE } from "../../library/types";
import { NotFound } from "../../shell/NotFound";

export const Route = createFileRoute("/_app/labels/$labelId")({
  validateSearch: validateLibrarySearch,
  component: LabelPage,
});

function LabelPage() {
  const { labelId } = Route.useParams();
  const label = useQuery(api.labels.get, { id: labelId });
  if (label === undefined)
    return (
      <section className="p-6" role="status" aria-label="Loading label">
        <Skeleton className="h-8 w-48" />
      </section>
    );
  // Foreign, missing, and malformed ids all arrive as null.
  if (label === null) return <NotFound />;
  return <LabelItems labelId={label._id} name={label.name} />;
}

function LabelItems({
  labelId,
  name,
}: {
  labelId: Id<"labels">;
  name: string;
}) {
  const feed = usePaginatedQuery(
    api.itemLabels.listItemsForLabel,
    { labelId },
    { initialNumItems: PAGE_SIZE },
  );
  return <LibraryView heading={name} feed={feed} empty="label" />;
}
