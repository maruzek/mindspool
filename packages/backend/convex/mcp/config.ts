export type EnabledMcpConfig = Readonly<{
  enabled: true;
  environment: "development" | "production";
  resourceUrl: string;
  sessionIssuer: string;
  clerkSecretKey: string;
  allowedOrigins: readonly string[];
  allowedClientIds: readonly string[];
  allowedSubjects: readonly string[];
}>;

export type McpConfig = EnabledMcpConfig | Readonly<{ enabled: false }>;

export class McpConfigurationError extends Error {
  constructor() {
    super("MCP configuration is unavailable");
  }
}

function httpsUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new McpConfigurationError();
    }
    return url;
  } catch {
    throw new McpConfigurationError();
  }
}

const list = (value: string | undefined) => [
  ...new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ),
];

export function readMcpConfig(): McpConfig {
  const flag = process.env.MINDSPOOL_MCP_ENABLED;
  if (!flag || flag === "false") return { enabled: false };
  if (flag !== "true") throw new McpConfigurationError();

  const environment = process.env.MINDSPOOL_ENVIRONMENT;
  const resourceUrl = process.env.MINDSPOOL_MCP_RESOURCE_URL ?? "";
  const sessionIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN ?? "";
  const clerkSecretKey = process.env.CLERK_SECRET_KEY ?? "";
  const allowedClientIds = list(process.env.MINDSPOOL_MCP_ALLOWED_CLIENT_IDS);
  const allowedOrigins = list(process.env.MINDSPOOL_MCP_ALLOWED_ORIGINS);
  const allowedSubjects = list(process.env.MINDSPOOL_ALLOWED_SUBJECTS);
  if (environment !== "development" && environment !== "production")
    throw new McpConfigurationError();
  const expectedKeyPrefix =
    environment === "development" ? "sk_test_" : "sk_live_";
  if (
    !clerkSecretKey.startsWith(expectedKeyPrefix) ||
    clerkSecretKey.length <= expectedKeyPrefix.length
  )
    throw new McpConfigurationError();
  if (
    httpsUrl(resourceUrl).pathname !== "/mcp" ||
    httpsUrl(resourceUrl).href !== resourceUrl
  )
    throw new McpConfigurationError();
  const issuerOrigin = httpsUrl(sessionIssuer).origin;
  if (sessionIssuer !== issuerOrigin && sessionIssuer !== `${issuerOrigin}/`)
    throw new McpConfigurationError();
  if (!allowedClientIds.length) throw new McpConfigurationError();
  for (const client of allowedClientIds) httpsUrl(client);
  for (const origin of allowedOrigins) {
    if (httpsUrl(origin).origin !== origin) throw new McpConfigurationError();
  }
  return {
    enabled: true,
    environment,
    resourceUrl,
    sessionIssuer,
    clerkSecretKey,
    allowedClientIds,
    allowedOrigins,
    allowedSubjects,
  };
}
