import { createFileRoute } from "@tanstack/react-router";
import { NotBuilt } from "../../shell/NotBuilt";

export const Route = createFileRoute("/_rail/graph")({
  component: () => <NotBuilt title="Graph" />,
});
