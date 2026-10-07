type TokenClient = {
  session?: {
    getToken(options: { template: string }): Promise<string | null>;
  } | null;
};

/**
 * Hands out a Convex token from a long-lived Clerk client. A client loaded
 * before the user signed in keeps reporting no session, so when there is
 * none it is replaced once with a fresh one before giving up.
 */
export function createTokenProvider(
  load: () => Promise<TokenClient>,
  template = "convex",
) {
  let cached: Promise<TokenClient> | undefined;
  const fresh = () => (cached = load());

  return async function getToken(): Promise<string | null> {
    try {
      let client = await (cached ?? fresh());
      if (!client.session) client = await fresh();
      if (!client.session) {
        console.info("[mindspool] no Clerk session");
        return null;
      }
      return await client.session.getToken({ template });
    } catch (error) {
      cached = undefined;
      throw error;
    }
  };
}
