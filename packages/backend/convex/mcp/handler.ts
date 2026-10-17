import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  readRequestBody,
} from "@modelcontextprotocol/server";
import { ConvexError } from "convex/values";
import { McpAuthorizationError } from "./auth";
import type { EnabledMcpConfig, McpConfig } from "./config";
import type { McpTool, McpToolContext } from "./tools";
import { registerTools, requiredScopesFor } from "./tools";
import { createMcpTransportHandler } from "./transport";
import type {
  McpScope,
  VerifiedMcpClaims,
  VerifiedMcpPrincipal,
} from "./types";

export type McpOutcome =
  | "ok"
  | "tool_error"
  | "invalid_token"
  | "insufficient_scope"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "bad_request"
  | "method_not_allowed"
  | "too_large"
  | "internal_error";

export type McpEvent = {
  requestId: string;
  connectionId?: string;
  tool?: string;
  outcome: McpOutcome;
  durationMs: number;
  now: number;
};

export type McpAdmission =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Everything the handler touches outside the request; production wiring is in http.ts. */
export type McpServices = Readonly<{
  config: () => McpConfig;
  now: () => number;
  verify: (
    request: Request,
    config: EnabledMcpConfig,
    signal: AbortSignal,
  ) => Promise<VerifiedMcpClaims>;
  admitIngress: (now: number) => Promise<McpAdmission>;
  authorize: (claims: VerifiedMcpClaims) => Promise<VerifiedMcpPrincipal>;
  admitConnection: (args: {
    connectionId: string;
    isWrite: boolean;
    now: number;
  }) => Promise<McpAdmission>;
  runQuery: McpToolContext["runQuery"];
  tools: readonly McpTool[];
  record: (event: McpEvent) => Promise<void>;
}>;

/** What one request learned along the way, for its diagnostic record. */
type Trace = { connectionId?: string; tool?: string };

const MAX_BODY_BYTES = 65_536;
const REQUEST_DEADLINE_MS = 15_000;
const READ_SCOPE: McpScope = "mindspool:read";
const SUPPORTED_SCOPES: McpScope[] = [
  "mindspool:read",
  "mindspool:labels:write",
];

const json = (status: number, body: unknown, headers?: HeadersInit) =>
  Response.json(body, { status, headers });
const forbidden = () =>
  json(403, { error: "access_denied", error_description: "Access denied" });
const unavailable = () =>
  json(503, {
    error: "temporarily_unavailable",
    error_description: "MindSpool is temporarily unavailable",
  });
const tooMany = (retryAfterSeconds: number) =>
  json(
    429,
    { error: "rate_limited", error_description: "Too many requests" },
    { "Retry-After": String(retryAfterSeconds) },
  );

function metadataUrl(config: EnabledMcpConfig) {
  return getOAuthProtectedResourceMetadataUrl(new URL(config.resourceUrl));
}

function invalidToken(config: EnabledMcpConfig) {
  return bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InvalidToken, "Authentication required"),
    { requiredScopes: [READ_SCOPE], resourceMetadataUrl: metadataUrl(config) },
  );
}

function insufficientScope(
  config: EnabledMcpConfig,
  scopes: readonly McpScope[],
) {
  return bearerAuthChallengeResponse(
    new OAuthError(
      OAuthErrorCode.InsufficientScope,
      "Required permission missing",
    ),
    { requiredScopes: [...scopes], resourceMetadataUrl: metadataUrl(config) },
  );
}

function verificationFailure(config: EnabledMcpConfig, error: unknown) {
  if (!(error instanceof McpAuthorizationError)) return unavailable();
  switch (error.code) {
    case "invalid_token":
      return invalidToken(config);
    case "insufficient_scope":
      return insufficientScope(config, [READ_SCOPE]);
    case "forbidden":
      return forbidden();
    case "unavailable":
      return unavailable();
  }
}

function authorizationFailure(config: EnabledMcpConfig, error: unknown) {
  const code =
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null
      ? error.data.code
      : undefined;
  if (code === "INSUFFICIENT_SCOPE")
    return insufficientScope(config, [READ_SCOPE]);
  if (code === "FORBIDDEN") return forbidden();
  return unavailable();
}

/** Tool names called by the message or batch. Parsing itself is the SDK's job. */
function calledTools(body: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((message) =>
    message &&
    typeof message === "object" &&
    message.method === "tools/call" &&
    typeof message.params?.name === "string"
      ? [message.params.name as string]
      : [],
  );
}

function originAllowed(request: Request, config: EnabledMcpConfig) {
  const origin = request.headers.get("origin");
  // Desktop CLIs send no Origin; browsers must come from a configured origin.
  return origin === null || config.allowedOrigins.includes(origin);
}

function hostAllowed(request: Request, config: EnabledMcpConfig) {
  return new URL(request.url).host === new URL(config.resourceUrl).host;
}

async function serve(
  request: Request,
  services: McpServices,
  config: EnabledMcpConfig,
  signal: AbortSignal,
  trace: Trace,
): Promise<Response> {
  if (!hostAllowed(request, config) || !originAllowed(request, config))
    return forbidden();
  const method = request.method;
  if (method !== "POST" && method !== "GET" && method !== "DELETE")
    return json(405, null, { Allow: "POST" });
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity")
    return json(415, { error: "unsupported_content_encoding" });

  let body = "";
  if (method === "POST") {
    const read = await readRequestBody(request, MAX_BODY_BYTES);
    if (read.tooLarge) return json(413, { error: "request_too_large" });
    body = read.text;
  }

  if (!/^Bearer\s+\S/i.test(request.headers.get("authorization") ?? ""))
    return invalidToken(config);
  const ingress = await services.admitIngress(services.now());
  if (!ingress.allowed) return tooMany(ingress.retryAfterSeconds);

  let claims: VerifiedMcpClaims;
  try {
    claims = await services.verify(request, config, signal);
  } catch (error) {
    return verificationFailure(config, error);
  }
  let principal: VerifiedMcpPrincipal;
  try {
    principal = await services.authorize(claims);
  } catch (error) {
    return authorizationFailure(config, error);
  }
  trace.connectionId = principal.connectionId;

  // v1 has no standalone SSE stream or transport session.
  if (method !== "POST") return json(405, null, { Allow: "POST" });

  const calls = calledTools(body);
  // Only registered names are recorded, and only for a single call.
  if (calls.length === 1 && requiredScopesFor(services.tools, calls[0]!))
    trace.tool = calls[0];
  let isWrite = false;
  for (const name of calls) {
    const required = requiredScopesFor(services.tools, name);
    if (!required) continue; // the SDK reports unknown tools
    if (required.some((scope) => !principal.scopes.includes(scope)))
      return insufficientScope(config, required);
    if (required.includes("mindspool:labels:write")) isWrite = true;
  }
  const admission = await services.admitConnection({
    connectionId: principal.connectionId,
    isWrite,
    now: services.now(),
  });
  if (!admission.allowed) return tooMany(admission.retryAfterSeconds);

  const context: McpToolContext = { principal, runQuery: services.runQuery };
  return createMcpTransportHandler({
    registerTools: (server) => registerTools(server, services.tools, context),
    authInfo: {
      // The SDK only needs scopes for its challenges; the raw token stays here.
      token: "verified",
      clientId: principal.clientId,
      scopes: [...principal.scopes],
      expiresAt: Math.floor(claims.expiresAt / 1000),
      resource: new URL(config.resourceUrl),
      resourceMetadataUrl: metadataUrl(config),
    },
  })(
    new Request(request.url, {
      method,
      headers: request.headers,
      body,
    }),
  );
}

/** The `/mcp` endpoint: admission, live authorization, scope checks, then SDK dispatch. */
export async function handleMcpRequest(
  request: Request,
  services: McpServices,
): Promise<Response> {
  let config: McpConfig;
  try {
    config = services.config();
  } catch {
    return unavailable();
  }
  if (!config.enabled) return new Response(null, { status: 404 });

  const started = services.now();
  const trace: Trace = {};
  let timedOut = false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve(unavailable());
    }, REQUEST_DEADLINE_MS);
  });
  let response: Response;
  try {
    response = await Promise.race([
      serve(request, services, config, controller.signal, trace),
      deadline,
    ]);
  } catch {
    response = json(500, {
      error: "server_error",
      error_description: "Something went wrong",
    });
  } finally {
    clearTimeout(timer);
  }
  const now = services.now();
  try {
    await services.record({
      requestId: crypto.randomUUID(),
      ...(trace.connectionId ? { connectionId: trace.connectionId } : {}),
      ...(trace.tool ? { tool: trace.tool } : {}),
      outcome: timedOut ? "timeout" : await outcomeOf(response),
      durationMs: now - started,
      now,
    });
  } catch {
    // A diagnostic failure never changes or repeats a completed request.
  }
  return response;
}

/** True when any JSON-RPC result in the body is a tool error (`isError`). */
async function hasToolError(response: Response) {
  try {
    const body: unknown = await response.clone().json();
    return (Array.isArray(body) ? body : [body]).some(
      (message) => message?.result?.isError === true,
    );
  } catch {
    return false;
  }
}

async function outcomeOf(response: Response): Promise<McpOutcome> {
  switch (response.status) {
    case 200:
      return (await hasToolError(response)) ? "tool_error" : "ok";
    case 202:
      return "ok";
    case 401:
      return "invalid_token";
    case 403:
      return response.headers
        .get("www-authenticate")
        ?.includes("insufficient_scope")
        ? "insufficient_scope"
        : "forbidden";
    case 405:
      return "method_not_allowed";
    case 413:
      return "too_large";
    case 429:
      return "rate_limited";
    case 503:
      return "unavailable";
    case 500:
      return "internal_error";
    default:
      return "bad_request";
  }
}

/** Public protected-resource metadata (RFC 9728); never contains user data. */
export function handleMcpMetadata(
  request: Request,
  readConfig: () => McpConfig,
): Response {
  let config: McpConfig;
  try {
    config = readConfig();
  } catch {
    return unavailable();
  }
  if (!config.enabled) return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  const cors: Record<string, string> =
    origin && config.allowedOrigins.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "MCP-Protocol-Version",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        }
      : { Vary: "Origin" };
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET")
    return json(405, null, { ...cors, Allow: "GET, OPTIONS" });
  return json(
    200,
    {
      resource: config.resourceUrl,
      authorization_servers: [config.sessionIssuer.replace(/\/$/, "")],
      scopes_supported: SUPPORTED_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "MindSpool",
    },
    { ...cors, "Cache-Control": "public, max-age=300" },
  );
}
