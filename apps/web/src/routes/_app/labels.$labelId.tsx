import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Skeleton } from "@mindspool/ui/components/skeleton";
import { validateLabelSearch } from "../../search/searchParams";
import { BoardView } from "../../boards/BoardView";
import { LibraryView } from "../../library/LibraryView";
import { useItemsFeed } from "../../library/useItemsFeed";
import { LabelDescription } from "../../shell/LabelDescription";
import { NotFound } from "../../shell/NotFound";

export const Route = createFileRoute("/_app/labels/$labelId")({
  validateSearch: validateLabelSearch,
  component: LabelPage,
});

function LabelPage() {
  const { labelId } = Route.useParams();
  const { layout } = Route.useSearch();
  const label = useQuery(api.labels.get, { id: labelId });
  if (label === undefined)
    return (
      <section className="p-6" role="status" aria-label="Loading label">
        <Skeleton className="h-8 w-48" />
      </section>
    );
  // Foreign, missing, and malformed ids all arrive as null.
  if (label === null) return <NotFound />;
  if (layout === "board")
    return <BoardView labelId={label._id} name={label.name} />;
  return (
    <LabelItems
      labelId={label._id}
      name={label.name}
      description={label.description}
    />
  );
}

function LabelItems({
  labelId,
  name,
  description,
}: {
  labelId: Id<"labels">;
  name: string;
  description?: string;
}) {
  const feed = useItemsFeed({ labelId });
  return (
    <LibraryView
      heading={name}
      subheading={
        <LabelDescription labelId={labelId} description={description} />
      }
      feed={feed}
      scope="label"
    />
  );
}
