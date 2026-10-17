import { discoveryTools } from "./discovery";
import type { McpTool } from "./tools";
import { connectionTool } from "./tools";

/** Every tool the hosted endpoint serves; listing and dispatch share this list. */
export const productionTools: readonly McpTool[] = [
  connectionTool,
  ...discoveryTools,
];
