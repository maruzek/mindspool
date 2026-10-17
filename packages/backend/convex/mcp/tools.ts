import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { requireScopes } from "@modelcontextprotocol/server";
import { ConvexError } from "convex/values";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { z } from "zod";
import type {
  ConnectionCapabilities,
  McpScope,
  VerifiedMcpPrincipal,
} from "./types";

export type McpToolContext = Readonly<{
  principal: VerifiedMcpPrincipal;
  runQuery: <Query extends FunctionReference<"query", "internal">>(
    query: Query,
    args: Query["_args"],
  ) => Promise<FunctionReturnType<Query>>;
}>;

export type McpDomainErrorCode =
  "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "INTERNAL_ERROR";

/** A domain failure a tool reports as `isError: true`, never as a protocol error. */
export class McpToolError extends Error {
  constructor(
    readonly code: McpDomainErrorCode,
    message: string,
    readonly retryable = code === "UNAVAILABLE",
  ) {
    super(message);
  }
}

type ToolObject = z.ZodObject;

export type McpTool = Readonly<{
  name: string;
  requiredScopes: readonly [McpScope, ...McpScope[]];
  title: string;
  description: string;
  inputSchema: ToolObject;
  outputSchema: ToolObject;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  handler: (args: never, context: McpToolContext) => Promise<unknown>;
}>;

/** Keeps each tool's handler typed against its own schemas. */
export function defineTool<Input extends ToolObject, Output extends ToolObject>(
  tool: Omit<McpTool, "inputSchema" | "outputSchema" | "handler"> & {
    inputSchema: Input;
    outputSchema: Output;
    handler: (
      args: z.output<Input>,
      context: McpToolContext,
    ) => Promise<z.input<Output>>;
  },
): McpTool {
  return tool as McpTool;
}

const PUBLIC_MESSAGES: Record<string, McpDomainErrorCode> = {
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAVAILABLE: "UNAVAILABLE",
};

/** Domain failures keep their code and message; anything else is an opaque internal error. */
export function toolErrorOf(error: unknown): McpToolError {
  if (error instanceof McpToolError) return error;
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    typeof error.data.code === "string" &&
    typeof error.data.message === "string" &&
    PUBLIC_MESSAGES[error.data.code]
  )
    return new McpToolError(
      PUBLIC_MESSAGES[error.data.code]!,
      error.data.message,
    );
  return new McpToolError("INTERNAL_ERROR", "Something went wrong", false);
}

export function toolResult(output: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
    structuredContent: output as Record<string, unknown>,
  };
}

function errorResult(error: McpToolError): CallToolResult {
  const output = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  };
  return { ...toolResult(output), isError: true };
}

export function connectionCapabilities(
  principal: VerifiedMcpPrincipal,
): ConnectionCapabilities {
  return {
    service: "MindSpool",
    permissions: {
      readLibrary: true,
      editItemLabels: principal.scopes.includes("mindspool:labels:write"),
    },
  };
}

export const connectionTool = defineTool({
  name: "mindspool_connection",
  requiredScopes: ["mindspool:read"],
  title: "MindSpool connection",
  description:
    "Reports which MindSpool permissions this connection has. Reading the library is always granted; editing item labels only when the user enabled it.",
  inputSchema: z.strictObject({}),
  outputSchema: z.strictObject({
    service: z.literal("MindSpool"),
    permissions: z.strictObject({
      readLibrary: z.literal(true),
      editItemLabels: z.boolean(),
    }),
  }),
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (_args, { principal }) => connectionCapabilities(principal),
});

export const productionTools: readonly McpTool[] = [connectionTool];

/** The closed registry used by both listing and dispatch; unknown names return null. */
export function requiredScopesFor(
  tools: readonly McpTool[],
  name: string,
): readonly McpScope[] | null {
  return tools.find((tool) => tool.name === name)?.requiredScopes ?? null;
}

/** Registers every tool with its SDK scope challenge and domain error mapping. */
export function registerTools(
  server: McpServer,
  tools: readonly McpTool[],
  context: McpToolContext,
) {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        scopeChallenge: requireScopes(...tool.requiredScopes),
      },
      async (args: unknown) => {
        try {
          return toolResult(await tool.handler(args as never, context));
        } catch (error) {
          return errorResult(toolErrorOf(error));
        }
      },
    );
  }
}
