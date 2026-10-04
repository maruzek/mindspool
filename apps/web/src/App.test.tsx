import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { App } from "./App";
import { SaveItemForm } from "./SaveItemForm";

const state = vi.hoisted(() => ({
  authenticated: true,
  signedIn: true,
  userId: "alice",
  sessionId: "session-a",
  create: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: state.signedIn,
    userId: state.userId,
    sessionId: state.sessionId,
  }),
  UserButton: () => <button>Account</button>,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: state.authenticated,
  }),
  useMutation: () => state.create,
}));
vi.mock("./Workspace", () => ({
  Workspace: (props: React.ComponentProps<typeof SaveItemForm>) => (
    <SaveItemForm {...props} onSaved={() => {}} />
  ),
}));

beforeEach(() => {
  state.authenticated = true;
  state.signedIn = true;
  state.userId = "alice";
  state.sessionId = "session-a";
  state.create.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);
const app = () => (
  <StrictMode>
    <App authConfigured backendConfigured />
  </StrictMode>
);

describe("session-scoped capture drafts", () => {
  it("keeps a long text draft after switching to Link and reloading", () => {
    const view = render(app());
    fireEvent.click(screen.getByLabelText("Text or idea"));
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "X".repeat(9000) },
    });
    fireEvent.click(screen.getByLabelText("Link"));
    const key = sessionStorage.key(0)!;
    const saved = sessionStorage.getItem(key)!;
    view.unmount();
    sessionStorage.setItem(key, saved);
    render(app());
    expect(
      (screen.getByLabelText("URL") as HTMLTextAreaElement).value.length,
    ).toBe(9000);
  });

  it("purges stale session drafts on initial signed-out load while retaining other storage", () => {
    const oldKey = "mindspool:capture-draft:other:previous";
    sessionStorage.setItem(
      oldKey,
      JSON.stringify({
        inputType: "text",
        originalInput: "Private old draft",
        captureKey: null,
      }),
    );
    sessionStorage.setItem("other-app-preferences", "keep");
    state.signedIn = false;
    render(app());
    expect(sessionStorage.getItem(oldKey)).toBeNull();
    expect(sessionStorage.getItem("other-app-preferences")).toBe("keep");
  });
  it("retains input and retry key across a failed save and authentication interruption", async () => {
    state.create
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce("saved-id");
    const view = render(app());
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/draft" },
    });
    fireEvent.click(screen.getByText("Save item"));
    await screen.findByRole("alert");
    const key = state.create.mock.calls[0]![0].captureKey;
    state.authenticated = false;
    view.rerender(app());
    expect(
      (screen.getByLabelText("Unsaved input") as HTMLTextAreaElement).value,
    ).toBe("https://example.com/draft");
    expect(screen.queryByText("Save item")).toBeNull();
    state.authenticated = true;
    view.rerender(app());
    expect((screen.getByLabelText("URL") as HTMLTextAreaElement).value).toBe(
      "https://example.com/draft",
    );
    fireEvent.click(screen.getByText("Save item"));
    await screen.findByText("Item saved.");
    expect(state.create.mock.calls[1]![0].captureKey).toBe(key);
    expect((screen.getByLabelText("URL") as HTMLTextAreaElement).value).toBe(
      "",
    );
    expect(sessionStorage.length).toBe(0);
  });

  it("clears the old draft on account change and sign-out", () => {
    const view = render(app());
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/alice" },
    });
    expect(sessionStorage.length).toBe(1);
    state.userId = "bob";
    state.sessionId = "session-b";
    view.rerender(app());
    expect((screen.getByLabelText("URL") as HTMLTextAreaElement).value).toBe(
      "",
    );
    expect(sessionStorage.length).toBe(0);
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/bob" },
    });
    state.signedIn = false;
    view.rerender(app());
    expect(screen.queryByLabelText("URL")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("restores a valid draft after page reload and ignores malformed storage", () => {
    const view = render(app());
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/reload" },
    });
    const key = sessionStorage.key(0)!;
    const saved = sessionStorage.getItem(key)!;
    view.unmount();
    // A real page reload destroys the document without running React cleanup.
    sessionStorage.setItem(key, saved);
    const reloaded = render(app());
    expect((screen.getByLabelText("URL") as HTMLTextAreaElement).value).toBe(
      "https://example.com/reload",
    );
    reloaded.unmount();
    sessionStorage.setItem(key, "broken json");
    render(app());
    expect((screen.getByLabelText("URL") as HTMLTextAreaElement).value).toBe(
      "",
    );
  });

  it("does not erase a newer draft when an interrupted save later succeeds", async () => {
    let resolve!: (value: string) => void;
    state.create.mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const view = render(app());
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/first" },
    });
    fireEvent.click(screen.getByText("Save item"));
    state.authenticated = false;
    view.rerender(app());
    state.authenticated = true;
    view.rerender(app());
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/newer" },
    });
    await act(async () => {
      resolve("saved-id");
    });
    expect((screen.getByLabelText("URL") as HTMLTextAreaElement).value).toBe(
      "https://example.com/newer",
    );
  });
});
