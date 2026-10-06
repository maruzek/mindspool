import { createFileRoute } from "@tanstack/react-router";
import { RailShell } from "../shell/RailShell";

export const Route = createFileRoute("/_rail")({ component: RailShell });
