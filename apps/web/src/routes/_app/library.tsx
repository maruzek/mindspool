import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/library")({
  component: () => (
    <section className="p-6">
      <h1 className="text-2xl">Library</h1>
    </section>
  ),
});
