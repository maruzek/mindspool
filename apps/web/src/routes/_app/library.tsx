import { createFileRoute } from "@tanstack/react-router";
import { LibraryView } from "../../library/LibraryView";
import { validateLibrarySearch } from "../../search/searchParams";
import { useItemsFeed } from "../../library/useItemsFeed";

export const Route = createFileRoute("/_app/library")({
  validateSearch: validateLibrarySearch,
  component: LibraryPage,
});

function LibraryPage() {
  return <LibraryView heading="Library" feed={useItemsFeed({})} />;
}
