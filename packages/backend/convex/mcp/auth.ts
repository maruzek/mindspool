import { z } from "zod";
import type { EnabledMcpConfig } from "./config";
import type { McpScope, VerifiedMcpClaims } from "./types";

export type McpAuthorizationCode =
  "invalid_token" | "insufficient_scope" | "forbidden" | "unavailable";

export class McpAuthorizationError extends Error {
  constructor(readonly code: McpAuthorizationCode) {
    super(
      {
        invalid_token: "Authentication required",
        insufficient_scope: "Required permission missing",
        forbidden: "Access denied",
        unavailable: "Authorization is unavailable",
      }[code],
    );
  }
}

// No issuer is returned for opaque tokens. The configured instance credential
// establishes the namespace; preserve the exact issuer used by existing app JWTs.
export function ownerIdForMcpSubject(
  subject: string,
  configuredSessionIssuer: string,
): string {
  return `${configuredSessionIssuer}|${subject}`;
}

const tokenShape = z.object({
  object: z.literal("clerk_idp_oauth_access_token"),
  subject: z.string(),
  client_id: z.string(),
  scopes: z.array(z.string()),
  aud: z.array(z.string()).optional(),
  revoked: z.boolean(),
  expired: z.boolean(),
  expiration: z.number().finite().nullable(),
  // Actor-chain tokens have not been approved for this end-user grant flow.
  act: z.unknown().optional(),
  iss: z.string().optional(),
});
const userShape = z.object({
  id: z.string(),
  object: z.literal("user"),
  banned: z.boolean(),
  locked: z.boolean(),
  deprovisioned: z.boolean(),
});

async function verifyLive(
  request: Request,
  config: EnabledMcpConfig,
  signal: AbortSignal,
): Promise<VerifiedMcpClaims> {
  const bearer = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!bearer || bearer[1]!.length > 16_384)
    throw new McpAuthorizationError("invalid_token");
  const headers = {
    Authorization: `Bearer ${config.clerkSecretKey}`,
    "Content-Type": "application/json",
    "Clerk-API-Version": "2026-08-20",
  };
  const response = await fetch(
    "https://api.clerk.com/v1/oauth_applications/access_tokens/verify",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ access_token: bearer[1] }),
      redirect: "error",
      signal,
    },
  );
  if ([400, 404, 422].includes(response.status))
    throw new McpAuthorizationError("invalid_token");
  // 401/403 here concern our server credential, not the caller's bearer.
  if (!response.ok) throw new McpAuthorizationError("unavailable");
  const body: unknown = await response.json();
  if (body && typeof body === "object") {
    if (
      ("active" in body && body.active === false) ||
      ("object" in body && body.object !== "clerk_idp_oauth_access_token")
    )
      throw new McpAuthorizationError("invalid_token");
    if (
      "object" in body &&
      body.object === "clerk_idp_oauth_access_token" &&
      (!("subject" in body) || body.subject === "")
    )
      throw new McpAuthorizationError("invalid_token");
  }
  const parsed = tokenShape.safeParse(body);
  if (!parsed.success) throw new McpAuthorizationError("unavailable");
  const claims = parsed.data;
  if (
    !/^user_[A-Za-z0-9_-]+$/.test(claims.subject) ||
    claims.subject.length > 256 ||
    !config.allowedClientIds.includes(claims.client_id) ||
    !claims.aud?.includes(config.resourceUrl) ||
    claims.revoked ||
    claims.expired ||
    claims.expiration === null ||
    !Number.isSafeInteger(claims.expiration * 1000) ||
    claims.expiration * 1000 <= Date.now() ||
    claims.act !== undefined ||
    (claims.iss !== undefined && claims.iss !== config.sessionIssuer)
  ) {
    throw new McpAuthorizationError("invalid_token");
  }
  if (!claims.scopes.includes("mindspool:read"))
    throw new McpAuthorizationError("insufficient_scope");
  if (
    config.allowedSubjects.length &&
    !config.allowedSubjects.includes(claims.subject)
  )
    throw new McpAuthorizationError("forbidden");

  const userResponse = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(claims.subject)}`,
    { headers, redirect: "error", signal },
  );
  if (userResponse.status === 404)
    throw new McpAuthorizationError("invalid_token");
  if (!userResponse.ok) throw new McpAuthorizationError("unavailable");
  const user = userShape.safeParse(await userResponse.json());
  if (!user.success || user.data.id !== claims.subject)
    throw new McpAuthorizationError("unavailable");
  if (user.data.banned || user.data.locked || user.data.deprovisioned)
    throw new McpAuthorizationError("forbidden");
  if (claims.expiration * 1000 <= Date.now())
    throw new McpAuthorizationError("invalid_token");
  const scopes: McpScope[] = ["mindspool:read"];
  if (claims.scopes.includes("mindspool:labels:write"))
    scopes.push("mindspool:labels:write");
  return {
    issuer: config.sessionIssuer,
    subject: claims.subject,
    clientId: claims.client_id,
    resource: config.resourceUrl,
    expiresAt: claims.expiration * 1000,
    scopes,
  };
}

// One deadline includes both fetches and response parsing. Race cancellation as
// well as passing signal: a stalled body must not extend the authorization budget.
export async function verifyMcpAccessToken(
  request: Request,
  config: EnabledMcpConfig,
  signal: AbortSignal,
): Promise<VerifiedMcpClaims> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  try {
    if (signal.aborted) throw new McpAuthorizationError("unavailable");
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => {
        controller.abort();
        reject(new McpAuthorizationError("unavailable"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(onAbort, 5000);
    });
    return await Promise.race([
      cancelled,
      verifyLive(request, config, controller.signal),
    ]);
  } catch (error) {
    if (error instanceof McpAuthorizationError) throw error;
    throw new McpAuthorizationError("unavailable");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
