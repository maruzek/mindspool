export type McpScope = "mindspool:read" | "mindspool:labels:write";

export type VerifiedMcpClaims = Readonly<{
  issuer: string;
  subject: string;
  clientId: string;
  resource: string;
  expiresAt: number;
  scopes: readonly McpScope[];
}>;

export type VerifiedMcpPrincipal = Readonly<{
  ownerId: string;
  subject: string;
  clientId: string;
  connectionId: string;
  scopes: readonly McpScope[];
}>;

export type ConnectionCapabilities = {
  service: "MindSpool";
  permissions: { readLibrary: true; editItemLabels: boolean };
};
