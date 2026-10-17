import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { IntegrationsPage } from "./IntegrationsPage";

const state = vi.hoisted(() => ({
  user: "alice",
  config: { enabled: true, resourceUrl: "https://dev.convex.site/mcp" } as
    { enabled: boolean; resourceUrl: string | null } | undefined,
  connections: [] as unknown[],
  status: "Exhausted",
  error: false,
  mutate: vi.fn(),
  loadMore: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ userId: state.user, sessionId: "session" }),
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.config,
  usePaginatedQuery: () => {
    if (state.error) throw new Error("subscription offline");
    return {
      results: state.connections,
      status: state.status,
      loadMore: state.loadMore,
    };
  },
  useMutation:
    (ref: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      state.mutate(getFunctionName(ref), args),
}));
const connection = {
  _id: "connection",
  clientId: "https://claude.ai/oauth/claude-code-client-metadata",
  status: "active",
  allowLabelWrite: false,
  createdAt: 1,
  lastUsedAt: 1,
};
beforeEach(() => {
  state.user = "alice";
  state.config = { enabled: true, resourceUrl: "https://dev.convex.site/mcp" };
  state.connections = [];
  state.status = "Exhausted";
  state.error = false;
  state.mutate.mockReset();
  state.loadMore.mockReset();
});
afterEach(cleanup);

describe("integrations", () => {
  it("shows loading, empty, unavailable and paginated states", () => {
    state.status = "LoadingFirstPage";
    const view = render(<IntegrationsPage />);
    expect(screen.getByText("Loading connections…")).toBeTruthy();
    state.status = "Exhausted";
    view.rerender(<IntegrationsPage />);
    expect(screen.getByText("No connected clients yet.")).toBeTruthy();
    state.connections = [connection];
    state.status = "CanLoadMore";
    view.rerender(<IntegrationsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Load more connections" }),
    );
    expect(state.loadMore).toHaveBeenCalledWith(10);
    state.config = { enabled: false, resourceUrl: null };
    view.rerender(<IntegrationsPage />);
    expect(
      screen.getByText("MCP is unavailable in this environment."),
    ).toBeTruthy();
  });

  it("shows scope distinctions and performs app enablement, disconnect and explicit reconnect", async () => {
    state.connections = [connection];
    const view = render(<IntegrationsPage />);
    expect(
      screen.getByText(/Signing out of MindSpool does not disconnect/),
    ).toBeTruthy();
    expect(screen.getByText(/all devices using this client/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enable label edits" }));
    await waitFor(() =>
      expect(state.mutate).toHaveBeenCalledWith(
        "mcpConnections:setLabelWrite",
        { connectionId: "connection", enabled: true },
      ),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Disconnect",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(state.mutate).toHaveBeenCalledWith("mcpConnections:disconnect", {
        connectionId: "connection",
      }),
    );
    state.connections = [{ ...connection, status: "revoked" }];
    view.rerender(<IntegrationsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() =>
      expect(state.mutate).toHaveBeenCalledWith("mcpConnections:reconnect", {
        connectionId: "connection",
      }),
    );
    expect(
      screen.getByText(/Reconnect always resets app-side label editing/),
    ).toBeTruthy();
  });

  it("keeps errors visible and ignores late mutation feedback after switching accounts", async () => {
    state.connections = [connection];
    let reject!: (error: Error) => void;
    state.mutate.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const view = render(<IntegrationsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(
      (screen.getByRole("button", { name: "Disconnect" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    state.user = "bob";
    state.connections = [];
    view.rerender(<IntegrationsPage />);
    reject(new Error("private failure"));
    await waitFor(() =>
      expect(screen.getByText("No connected clients yet.")).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    state.connections = [connection];
    view.rerender(<IntegrationsPage />);
    state.mutate.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("contains subscription failures in a retryable page error", () => {
    state.error = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<IntegrationsPage />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Connections could not load",
    );
    error.mockRestore();
  });
});
