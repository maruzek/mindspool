import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";
import { requireOwner } from "../auth";
import { createMcpTransportHandler } from "./transport";

// Temporary development proof only. The final MCP endpoint must verify OAuth
// credentials; this probe deliberately exercises the existing app JWT instead.
export async function handleMcpProof(
  request: Request,
  ctx: { auth: Auth },
): Promise<Response> {
  if (
    process.env.MINDSPOOL_ENVIRONMENT !== "development" ||
    process.env.MINDSPOOL_MCP_PROOF_ENABLED !== "true"
  ) {
    return new Response(null, { status: 404 });
  }
  try {
    await requireOwner(ctx);
  } catch (error) {
    if (
      error instanceof ConvexError &&
      typeof error.data === "object" &&
      error.data !== null &&
      "code" in error.data
    ) {
      if (error.data.code === "UNAUTHENTICATED") {
        return new Response(null, { status: 401 });
      }
      if (error.data.code === "FORBIDDEN") {
        return new Response(null, { status: 403 });
      }
    }
    return new Response(null, { status: 503 });
  }
  return createMcpTransportHandler({ registerTools: () => {} })(request);
}
