import { Component, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { Button } from "@mindspool/ui/components/button";
import { ClientSetup } from "./ClientSetup";
import { errorMessage } from "../errors";

const clients: Record<string, string> = {
  "https://chatgpt.com/oauth/codex/client.json": "Codex",
  "https://claude.ai/oauth/claude-code-client-metadata": "Claude Code",
};

class ConnectionsBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section role="alert" className="space-y-3 border-2 p-5">
          <h2>Connections could not load</h2>
          <p>Check your connection and try again.</p>
          <Button onClick={() => this.setState({ failed: false })}>
            Try again
          </Button>
        </section>
      );
    return this.props.children;
  }
}

/** A session change unmounts pending controls and their feedback. */
export function IntegrationsPage() {
  const { userId, sessionId } = useAuth();
  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-5 md:p-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Settings
        </p>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="max-w-2xl text-muted-foreground">
          Connect your saved library to Codex and Claude Code.
        </p>
      </header>
      <ConnectionsBoundary key={`${userId}:${sessionId}`}>
        <Connections />
      </ConnectionsBoundary>
    </main>
  );
}

function Connections() {
  const config = useQuery(api.mcpConnections.configuration, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.mcpConnections.list,
    {},
    { initialNumItems: 10 },
  );
  const setWrite = useMutation(api.mcpConnections.setLabelWrite);
  const disconnect = useMutation(api.mcpConnections.disconnect);
  const reconnect = useMutation(api.mcpConnections.reconnect);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function act(
    id: Id<"mcpConnections">,
    operation: () => Promise<unknown>,
  ) {
    if (pending) return;
    setPending(id);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError(
        errorMessage(cause, "The connection could not be updated. Try again."),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      {config === undefined ? (
        <p role="status">Loading connection setup…</p>
      ) : config.enabled && config.resourceUrl ? (
        <ClientSetup resourceUrl={config.resourceUrl} />
      ) : (
        <p role="status">MCP is unavailable in this environment.</p>
      )}
      <section aria-labelledby="connections-heading" className="space-y-4">
        <h2 id="connections-heading" className="text-xl font-semibold">
          Connected clients
        </h2>
        <p className="text-sm text-muted-foreground">
          Each connection applies to all devices using this client with your
          account. Signing out of MindSpool does not disconnect a client.
        </p>
        {error && (
          <p
            role="alert"
            className="border-2 border-destructive p-3 text-destructive"
          >
            {error}
          </p>
        )}
        {status === "LoadingFirstPage" ? (
          <p role="status">Loading connections…</p>
        ) : !results.length ? (
          <p className="border-2 border-dashed p-6 text-muted-foreground">
            No connected clients yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {results.map((connection) => (
              <li
                key={connection._id}
                className="space-y-3 border-2 bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="break-all text-lg font-semibold">
                    {clients[connection.clientId] ?? connection.clientId}
                  </h3>
                  <span className="border px-2 py-1 text-xs">
                    {connection.status === "active"
                      ? "Connected"
                      : "Disconnected"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Last used {new Date(connection.lastUsedAt).toLocaleString()}
                </p>
                <p className="text-sm">
                  {connection.status === "revoked"
                    ? "Access blocked, including existing tokens."
                    : connection.allowLabelWrite
                      ? "App-side label editing enabled. The client also needs OAuth write permission; no label-editing MCP tools are available yet."
                      : "App-side permission: read only."}
                </p>
                <div
                  className="flex flex-wrap gap-2"
                  aria-busy={pending === connection._id}
                >
                  {connection.status === "active" ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={pending !== null}
                        onClick={() =>
                          void act(connection._id, () =>
                            setWrite({
                              connectionId: connection._id,
                              enabled: !connection.allowLabelWrite,
                            }),
                          )
                        }
                      >
                        {connection.allowLabelWrite
                          ? "Disable label edits"
                          : "Enable label edits"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={pending !== null}
                        onClick={() =>
                          void act(connection._id, () =>
                            disconnect({ connectionId: connection._id }),
                          )
                        }
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={pending !== null}
                      onClick={() =>
                        void act(connection._id, () =>
                          reconnect({ connectionId: connection._id }),
                        )
                      }
                    >
                      Reconnect
                    </Button>
                  )}
                </div>
                {pending === connection._id && (
                  <p role="status" className="text-sm">
                    Updating connection…
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <Button
            variant="outline"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(10)}
          >
            {status === "LoadingMore"
              ? "Loading connections…"
              : "Load more connections"}
          </Button>
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        Enabling label edits here does not grant OAuth write scope. Reconnect
        always resets app-side label editing to read only. Disconnect blocks
        this client locally; remove its authorization in your provider account
        too to revoke the provider grant.
      </p>
    </div>
  );
}
