import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "MCP retention",
  { minutes: 5 },
  internal.mcpMaintenance.cleanupExpired,
  {},
);
export default crons;
