import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerIdForMcpSubject, verifyMcpAccessToken } from "./auth";
import type { EnabledMcpConfig } from "./config";

const resource = "https://dev.convex.site/mcp";
const clientId = "https://chatgpt.com/oauth/codex/client.json";
const config: EnabledMcpConfig = {
  enabled: true,
  environment: "development",
  resourceUrl: resource,
  sessionIssuer: "https://first.clerk.accounts.dev",
  clerkSecretKey: "sk_test_fixture",
  allowedClientIds: [clientId],
  allowedOrigins: [],
  allowedSubjects: [],
};
const now = 1_800_000_000_000;
const token = "sentinel-private-access-token";
const request = (authorization: string | null = `Bearer ${token}`) =>
  new Request(resource, {
    headers: authorization === null ? {} : { Authorization: authorization },
  });
const validToken = () => ({
  object: "clerk_idp_oauth_access_token",
  id: "oat_fixture",
  client_id: clientId,
  subject: "user_1",
  scopes: ["mindspool:read", "offline_access"],
  aud: [resource],
  revoked: false,
  expired: false,
  expiration: now / 1000 + 3600,
});
const validUser = () => ({
  id: "user_1",
  object: "user",
  banned: false,
  locked: false,
  deprovisioned: false,
});
const verify = (cfg = config, signal = new AbortController().signal) =>
  verifyMcpAccessToken(request(), cfg, signal);

describe("live OAuth verification and exact existing ownership", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        Response.json(
          String(url).includes("/users/") ? validUser() : validToken(),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("normalizes only live provider-approved OAuth claims, never a caller's owner", async () => {
    expect(await verify()).toEqual({
      issuer: config.sessionIssuer,
      subject: "user_1",
      clientId,
      resource,
      expiresAt: now + 3_600_000,
      scopes: ["mindspool:read"],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.clerk.com/v1/oauth_applications/access_tokens/verify",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({ access_token: token }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.clerk.com/v1/users/user_1",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("does not cache successful token or user checks", async () => {
    await verify();
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...validToken(), revoked: true }),
    );
    await expect(verify()).rejects.toMatchObject({ code: "invalid_token" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retains provider write consent without inventing an app grant", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...validToken(),
        scopes: [
          "mindspool:labels:write",
          "mindspool:read",
          "unknown",
          "mindspool:read",
        ],
      }),
    );
    expect((await verify()).scopes).toEqual([
      "mindspool:read",
      "mindspool:labels:write",
    ]);
  });

  it.each([null, "Basic secret", "Bearer", "Bearer a b", "Bearer a,Bearer b"])(
    "refuses malformed authorization %s without a provider call",
    async (header) => {
      await expect(
        verifyMcpAccessToken(
          request(header),
          config,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: "invalid_token" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { object: "session" },
    { object: "id_token" },
    { object: "m2m_token" },
    { active: false },
    { subject: "" },
    { subject: undefined },
    { subject: "user_../../admin" },
    { client_id: "https://unapproved.example/client" },
    { aud: ["https://other-environment.convex.site/mcp"] },
    { aud: undefined },
    { aud: [resource + "/"] },
    { expired: true },
    { revoked: true },
    { expiration: now / 1000 },
    { expiration: null },
    { expiration: Number.MAX_VALUE },
    { act: { sub: "user_actor" } },
    { iss: "https://other.clerk.accounts.dev" },
  ])(
    "rejects untrusted/inactive claims before user or library lookup: %j",
    async (patch) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ ...validToken(), ...patch }),
      );
      await expect(verify()).rejects.toMatchObject({ code: "invalid_token" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("requires read even if a token grants write", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...validToken(), scopes: ["mindspool:labels:write"] }),
    );
    await expect(verify()).rejects.toMatchObject({
      code: "insufficient_scope",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the existing account restriction before any user lookup", async () => {
    await expect(
      verify({ ...config, allowedSubjects: ["user_other"] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["banned", "locked", "deprovisioned"])(
    "refuses a currently %s user",
    async (flag) => {
      fetchMock
        .mockResolvedValueOnce(Response.json(validToken()))
        .mockResolvedValueOnce(Response.json({ ...validUser(), [flag]: true }));
      await expect(verify()).rejects.toMatchObject({ code: "forbidden" });
    },
  );

  it("refuses a provider-confirmed deleted account", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(validToken()))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(verify()).rejects.toMatchObject({ code: "invalid_token" });
  });

  it.each([
    [500, "unavailable"],
    [429, "unavailable"],
    [401, "unavailable"],
    [403, "unavailable"],
    [400, "invalid_token"],
    [404, "invalid_token"],
    [422, "invalid_token"],
  ])("classifies provider token status %s safely", async (status, code) => {
    fetchMock.mockResolvedValueOnce(
      new Response("sentinel-provider-details", { status }),
    );
    await expect(verify()).rejects.toMatchObject({ code });
  });

  it.each([
    null,
    {},
    { ...validToken(), scopes: "mindspool:read" },
    { ...validToken(), expiration: "later" },
    { ...validToken(), revoked: "false" },
  ])("fails unavailable on malformed provider data: %j", async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(verify()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("does not accept incomplete or mismatched user status", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(validToken()))
      .mockResolvedValueOnce(
        Response.json({ ...validUser(), id: "user_other" }),
      );
    await expect(verify()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("requires all active-user flags and treats user outages as unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(validToken()))
      .mockResolvedValueOnce(
        Response.json({ id: "user_1", object: "user", banned: false }),
      );
    await expect(verify()).rejects.toMatchObject({ code: "unavailable" });
    fetchMock
      .mockResolvedValueOnce(Response.json(validToken()))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(verify()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("refuses a token that expires during the active-user check", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ ...validToken(), expiration: now / 1000 + 1 }),
      )
      .mockImplementationOnce(async () => {
        vi.setSystemTime(now + 1000);
        return Response.json(validUser());
      });
    await expect(verify()).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("redacts credential and provider failure details from errors", async () => {
    fetchMock.mockRejectedValue(
      new Error(`${token} sk_test_fixture sentinel-provider-details`),
    );
    try {
      await verify();
      expect.fail("must reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "unavailable" });
      expect(String(error)).not.toMatch(/sentinel|sk_test/);
      expect(error).not.toHaveProperty("cause");
    }
  });

  it("bounds the complete verification including user response body to five seconds", async () => {
    const stalled = new ReadableStream({ start() {} });
    fetchMock
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return Response.json(validToken());
      })
      .mockResolvedValueOnce(new Response(stalled));
    const result = expect(verify()).rejects.toMatchObject({
      code: "unavailable",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors cancellation before and during a non-cooperating fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(verify(config, controller.signal)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const next = new AbortController();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = expect(verify(config, next.signal)).rejects.toMatchObject({
      code: "unavailable",
    });
    next.abort();
    await result;
  });

  it("preserves exact existing owner identity and separates different issuers", () => {
    expect(ownerIdForMcpSubject("user_1", config.sessionIssuer)).toBe(
      "https://first.clerk.accounts.dev|user_1",
    );
    expect(
      ownerIdForMcpSubject("user_1", "https://second.clerk.accounts.dev"),
    ).not.toBe(ownerIdForMcpSubject("user_1", config.sessionIssuer));
    expect(ownerIdForMcpSubject("user_1", config.sessionIssuer + "/")).toBe(
      "https://first.clerk.accounts.dev/|user_1",
    );
  });
});
