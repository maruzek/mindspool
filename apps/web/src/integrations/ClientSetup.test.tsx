import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClientSetup } from "./ClientSetup";
afterEach(cleanup);
it.each([
  "https://dev.convex.site/mcp",
  "https://fleet-eel-131.eu-west-1.convex.site/mcp",
])("copies a direct Codex add command for %s", async (resourceUrl) => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<ClientSetup resourceUrl={resourceUrl} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy Codex command" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      `codex mcp add mindspool --url '${resourceUrl}'`,
    ),
  );
  expect(await screen.findByText("Codex command copied.")).toBeTruthy();
});
it("renders only the configured environment URL and copies read-only commands", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<ClientSetup resourceUrl="https://dev.convex.site/mcp" />);
  fireEvent.click(screen.getByText("Manual read-only setup"));
  fireEvent.click(screen.getByRole("button", { name: "Copy Codex commands" }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  const commands = writeText.mock.calls[0]![0] as string;
  fireEvent.click(
    screen.getByRole("button", { name: "Copy Codex configuration" }),
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  expect(writeText.mock.calls[1]![0]).toContain(
    'url = "https://dev.convex.site/mcp"',
  );
  expect(commands).toContain("--scopes mindspool:read");
  expect(commands).not.toContain("labels:write");
  expect(
    screen.getByText(/--scope user controls where Claude saves/),
  ).toBeTruthy();
});
it.each([
  null,
  "http://example.com/mcp",
  "https://example.com/mcp'; touch bad",
  "https://example.com/mcp?secret=x",
])(
  "does not generate commands for unavailable or invalid configuration",
  (resourceUrl) => {
    render(<ClientSetup resourceUrl={resourceUrl} />);
    expect(
      screen.queryByRole("button", { name: "Copy Codex command" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy Codex commands" }),
    ).toBeNull();
    expect(screen.getByText("Connection setup is unavailable.")).toBeTruthy();
  },
);
it("reports clipboard failures and distinguishes app permission from OAuth permission", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
  });
  render(<ClientSetup resourceUrl="https://dev.convex.site/mcp" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Copy Claude Code command" }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    screen.getByText(/both app-side label editing and OAuth write scope/),
  ).toBeTruthy();
});
