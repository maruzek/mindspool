import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { LibraryView } from "../../library/LibraryView";
import { validateLibrarySearch } from "../../library/search";
import { PAGE_SIZE } from "../../library/types";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateLibrarySearch,
  component: LibraryPage,
});

function LibraryPage() {
  const feed = usePaginatedQuery(
    api.items.list,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  return <LibraryView heading="Library" feed={feed} />;
}
