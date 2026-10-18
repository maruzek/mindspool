import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "Visual capture cleanup",
  { minutes: 5 },
  internal.visualCaptureMaintenance.run,
  {},
);
crons.interval(
  "MCP retention",
  { minutes: 5 },
  internal.mcpMaintenance.cleanupExpired,
  {},
);
export default crons;
