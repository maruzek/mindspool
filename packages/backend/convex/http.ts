import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { handleMcpProof } from "./mcp/proof";

const http = httpRouter();

http.route({
  path: "/__mcp_probe",
  method: "POST",
  handler: httpAction((ctx, request) => handleMcpProof(request, ctx)),
});

export default http;
