import { createFileRoute } from "@tanstack/react-router";
import { LibraryView } from "../../library/LibraryView";
import { useItemsFeed } from "../../library/useItemsFeed";
import { validateLibrarySearch } from "../../search/searchParams";

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: validateLibrarySearch,
  component: InboxPage,
});

function InboxPage() {
  return (
    <LibraryView
      heading="Inbox"
      feed={useItemsFeed({ inbox: true })}
      scope="inbox"
    />
  );
}
