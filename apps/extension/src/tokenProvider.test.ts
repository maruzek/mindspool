import { describe, expect, it, vi } from "vitest";
import { createTokenProvider } from "./tokenProvider";

type Client = { session: { getToken(): Promise<string | null> } | null };
const signedIn = (token: string | null = "tok"): Client => ({
  session: { getToken: async () => token },
});
const signedOut: Client = { session: null };

describe("createTokenProvider", () => {
  it("reuses one client while it has a session", async () => {
    const load = vi.fn(async () => signedIn());
    const getToken = createTokenProvider(load);
    expect(await getToken()).toBe("tok");
    expect(await getToken()).toBe("tok");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("loads a fresh client when the cached one has no session, so a later sign-in is seen", async () => {
    const clients = [signedOut, signedIn("later")];
    const load = vi.fn(async () => clients.shift()!);
    const getToken = createTokenProvider(load);
    expect(await getToken()).toBe("later");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("returns null when there is still no session after the reload", async () => {
    const load = vi.fn(async () => signedOut);
    const getToken = createTokenProvider(load);
    expect(await getToken()).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("returns null when the session has no token", async () => {
    const getToken = createTokenProvider(async () => signedIn(null));
    expect(await getToken()).toBeNull();
  });
  it("forgets a client that failed to load and tries again next time", async () => {
    const load = vi
      .fn<() => Promise<Client>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(signedIn());
    const getToken = createTokenProvider(load);
    await expect(getToken()).rejects.toThrow("offline");
    expect(await getToken()).toBe("tok");
  });
  it("forgets a client whose token request failed", async () => {
    const broken: Client = {
      session: {
        getToken: async () => {
          throw new Error("expired");
        },
      },
    };
    const load = vi
      .fn<() => Promise<Client>>()
      .mockResolvedValueOnce(broken)
      .mockResolvedValue(signedIn());
    const getToken = createTokenProvider(load);
    await expect(getToken()).rejects.toThrow("expired");
    expect(await getToken()).toBe("tok");
  });
});
