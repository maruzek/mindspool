import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { useCaptureDraftContext } from "../capture/CaptureDraftProvider";

const state = vi.hoisted(() => ({
  loaded: true,
  signedIn: true,
  convexLoading: false,
  convexAuthenticated: true,
  userId: "alice",
  sessionId: "session-a",
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({
    isLoaded: state.loaded,
    isSignedIn: state.signedIn,
    userId: state.userId,
    sessionId: state.sessionId,
  }),
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: state.convexLoading,
    isAuthenticated: state.convexAuthenticated,
  }),
}));

/** Stands in for the capture bar: reads and writes the shared draft. */
function DraftProbe() {
  const { draft, setDraft, captured } = useCaptureDraftContext();
  return (
    <>
      <textarea
        aria-label="URL"
        value={draft.originalInput}
        onChange={(e) => setDraft({ ...draft, originalInput: e.target.value })}
      />
      <button onClick={() => setDraft({ ...draft, captureKey: "key-1" })}>
        Start save
      </button>
      <button onClick={() => setDraft({ ...draft, captureKey: "key-2" })}>
        Start newer save
      </button>
      <button onClick={() => captured("key-1")}>Finish save</button>
      <output aria-label="Key">{draft.captureKey ?? ""}</output>
    </>
  );
}
const gate = (
  props: { authConfigured?: boolean; backendConfigured?: boolean } = {},
  child: ReactNode = <DraftProbe />,
) => (
  <AuthGate
    authConfigured={props.authConfigured ?? true}
    backendConfigured={props.backendConfigured ?? true}
  >
    {child}
  </AuthGate>
);
const urlBox = () => screen.getByLabelText("URL") as HTMLTextAreaElement;
const type = (value: string) =>
  fireEvent.change(urlBox(), { target: { value } });

beforeEach(() => {
  Object.assign(state, {
    loaded: true,
    signedIn: true,
    convexLoading: false,
    convexAuthenticated: true,
    userId: "alice",
    sessionId: "session-a",
  });
  sessionStorage.clear();
});
afterEach(cleanup);

describe("gate states", () => {
  it("explains missing sign-in configuration", () => {
    render(gate({ authConfigured: false }));
    expect(screen.getByRole("status").textContent).toContain(
      "Sign-in is not configured for this environment.",
    );
  });

  it("explains a missing backend connection", () => {
    render(gate({ backendConfigured: false }));
    expect(screen.getByRole("status").textContent).toContain(
      "Library connection is not configured",
    );
  });

  it("announces Clerk loading", () => {
    state.loaded = false;
    render(gate());
    expect(screen.getByRole("status").textContent).toContain("Loading sign-in");
    expect(screen.queryByLabelText("URL")).toBeNull();
  });

  it("offers sign-in and sign-up when signed out", () => {
    state.signedIn = false;
    render(gate());
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.getByText("Create account")).toBeTruthy();
    expect(screen.queryByLabelText("URL")).toBeNull();
  });

  it("announces Convex connecting without mounting children", () => {
    state.convexLoading = true;
    state.convexAuthenticated = false;
    render(gate());
    expect(screen.getByRole("status").textContent).toContain(
      "Connecting to your library",
    );
    expect(screen.queryByLabelText("URL")).toBeNull();
  });

  it("alerts with Reconnect when Convex rejects the token", () => {
    state.convexAuthenticated = false;
    render(gate());
    expect(screen.getByRole("alert").textContent).toContain("disconnected");
    expect(screen.getByText("Reconnect")).toBeTruthy();
    expect(screen.queryByLabelText("URL")).toBeNull();
  });

  it("renders children when ready", () => {
    render(gate());
    expect(urlBox()).toBeTruthy();
  });

  it("shows an alert when the library throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("boom");
    }
    render(gate({}, <Boom />));
    expect(screen.getByRole("alert").textContent).toContain("could not load");
    spy.mockRestore();
  });
});

describe("session-scoped capture drafts", () => {
  it("restores a valid draft after reload and ignores malformed storage", () => {
    const view = render(gate());
    type("https://example.com/reload");
    const key = sessionStorage.key(0)!;
    const saved = sessionStorage.getItem(key)!;
    view.unmount();
    // A real reload destroys the document without running React cleanup.
    sessionStorage.setItem(key, saved);
    const reloaded = render(gate());
    expect(urlBox().value).toBe("https://example.com/reload");
    reloaded.unmount();
    sessionStorage.setItem(key, "broken json");
    render(gate());
    expect(urlBox().value).toBe("");
  });

  it("keeps a maximum-length draft across a reload", () => {
    const view = render(gate());
    type("X".repeat(9000));
    const key = sessionStorage.key(0)!;
    const saved = sessionStorage.getItem(key)!;
    view.unmount();
    sessionStorage.setItem(key, saved);
    render(gate());
    expect(urlBox().value.length).toBe(9000);
  });

  it("purges stale drafts on a signed-out load but keeps other storage", () => {
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
    render(gate());
    expect(sessionStorage.getItem(oldKey)).toBeNull();
    expect(sessionStorage.getItem("other-app-preferences")).toBe("keep");
  });

  it("retains input and key through an authentication interruption", () => {
    const view = render(gate());
    type("https://example.com/draft");
    fireEvent.click(screen.getByText("Start save"));
    state.convexAuthenticated = false;
    view.rerender(gate());
    expect(
      (screen.getByLabelText("Unsaved input") as HTMLTextAreaElement).value,
    ).toBe("https://example.com/draft");
    expect(screen.queryByLabelText("URL")).toBeNull();
    state.convexAuthenticated = true;
    view.rerender(gate());
    expect(urlBox().value).toBe("https://example.com/draft");
    expect(screen.getByLabelText("Key").textContent).toBe("key-1");
    fireEvent.click(screen.getByText("Finish save"));
    expect(urlBox().value).toBe("");
    expect(sessionStorage.length).toBe(0);
  });

  it("clears the old draft on account change and on sign-out", () => {
    const view = render(gate());
    type("https://example.com/alice");
    expect(sessionStorage.length).toBe(1);
    state.userId = "bob";
    state.sessionId = "session-b";
    view.rerender(gate());
    expect(urlBox().value).toBe("");
    expect(sessionStorage.length).toBe(0);
    type("https://example.com/bob");
    state.signedIn = false;
    view.rerender(gate());
    expect(screen.queryByLabelText("URL")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("does not erase a newer draft when an older save finishes", async () => {
    render(gate());
    type("https://example.com/first");
    fireEvent.click(screen.getByText("Start save"));
    type("https://example.com/newer");
    fireEvent.click(screen.getByText("Start newer save"));
    await act(async () => {
      fireEvent.click(screen.getByText("Finish save"));
    });
    expect(urlBox().value).toBe("https://example.com/newer");
    expect(screen.getByLabelText("Key").textContent).toBe("key-2");
  });
});
