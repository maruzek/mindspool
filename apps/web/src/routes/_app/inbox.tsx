import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inbox")({
  component: () => (
    <section className="p-6">
      <h1 className="text-2xl">Inbox</h1>
    </section>
  ),
});
