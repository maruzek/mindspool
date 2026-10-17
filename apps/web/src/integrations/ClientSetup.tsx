import { useState } from "react";
import { Button } from "@mindspool/ui/components/button";

function endpoint(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/mcp" &&
      url.href === value
      ? value
      : null;
  } catch {
    return null;
  }
}
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

export function ClientSetup({ resourceUrl }: { resourceUrl: string | null }) {
  const url = endpoint(resourceUrl);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  if (!url) return <p role="status">Connection setup is unavailable.</p>;
  // `mcp add` automatically starts OAuth using advertised scopes. A config
  // block plus explicit login keeps the requested permission read only.
  const codexConfig = `[mcp_servers.mindspool]\nurl = ${JSON.stringify(url)}`;
  const codex = "codex mcp login mindspool --scopes mindspool:read";
  const claude = `claude mcp add --transport http --scope user mindspool ${quote(url)}`;
  async function copy(value: string, name: string) {
    setError("");
    setCopied("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${name} copied.`);
    } catch {
      setError("Could not copy. Select and copy the command below.");
    }
  }
  return (
    <section
      aria-labelledby="setup-heading"
      className="space-y-4 border-2 bg-card p-5"
    >
      <h2 id="setup-heading" className="text-lg font-semibold">
        Connect a client
      </h2>
      <p>
        Read access shares your saved content, labels and source links with the
        client you authorize. Review the consent screen before connecting.
      </p>
      <div className="space-y-2">
        <h3 className="font-semibold">Codex</h3>
        <p className="text-sm text-muted-foreground">
          Add this section to ~/.codex/config.toml (replace an existing
          mindspool section), then sign in with explicit read scope.
        </p>
        <pre className="overflow-x-auto border bg-muted p-3 text-xs">
          <code>{codexConfig}</code>
        </pre>
        <Button
          variant="outline"
          onClick={() => void copy(codexConfig, "Codex configuration")}
        >
          Copy Codex configuration
        </Button>
        <pre className="overflow-x-auto border bg-muted p-3 text-xs">
          <code>{codex}</code>
        </pre>
        <Button
          variant="outline"
          onClick={() => void copy(codex, "Codex commands")}
        >
          Copy Codex commands
        </Button>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold">Claude Code</h3>
        <pre className="overflow-x-auto border bg-muted p-3 text-xs">
          <code>{claude}</code>
        </pre>
        <Button
          variant="outline"
          onClick={() => void copy(claude, "Claude Code command")}
        >
          Copy Claude Code command
        </Button>
        <p className="text-sm text-muted-foreground">
          Run /mcp in Claude Code, select mindspool, and authenticate in your
          browser. --scope user controls where Claude saves the configuration;
          it does not grant OAuth permissions.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        After connecting, call mindspool_connection and confirm readLibrary is
        true and editItemLabels is false. Label editing would require both
        app-side label editing and OAuth write scope; no label-editing tools are
        available yet.
      </p>
      <details className="space-y-2 text-sm">
        <summary className="cursor-pointer font-semibold">
          Permission upgrades and reconnecting
        </summary>
        <p className="mt-2">
          To approve future label edits, enable them for the connection here,
          then request mindspool:read,mindspool:labels:write during a new client
          authorization. In Codex, use codex mcp login mindspool --scopes
          mindspool:read,mindspool:labels:write. In Claude Code, review
          permissions during /mcp authentication. Server permission remains read
          only until both grants are present. Reconnect here before authorizing
          a disconnected client; reconnect clears app-side write enablement.
        </p>
      </details>
      {copied && (
        <p role="status" className="text-sm">
          {copied}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
