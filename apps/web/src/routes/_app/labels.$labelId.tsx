import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Skeleton } from "@mindspool/ui/components/skeleton";
import { NotFound } from "../../shell/NotFound";

export const Route = createFileRoute("/_app/labels/$labelId")({
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
  return (
    <section className="p-6">
      <h1 className="text-2xl">{label.name}</h1>
    </section>
  );
}
