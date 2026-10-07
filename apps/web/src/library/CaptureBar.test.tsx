import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureDraftProvider } from "../capture/CaptureDraftProvider";
import { backend, resetBackend } from "../test-utils/mocks";
import { CaptureBar } from "./CaptureBar";

vi.mock(
  "convex/react",
  async () => (await import("../test-utils/mocks")).convexMock,
);

const render_ = () =>
  render(
    <CaptureDraftProvider sessionKey="alice:session-a">
      <CaptureBar />
    </CaptureDraftProvider>,
  );
const box = () =>
  screen.getByLabelText("Capture a link or note") as HTMLTextAreaElement;
const save = () =>
  screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const type = (value: string) => fireEvent.change(box(), { target: { value } });
const click = () => act(async () => void fireEvent.click(save()));
const storedKey = () => {
  const raw = sessionStorage.getItem(sessionStorage.key(0)!);
  return (JSON.parse(raw!) as { captureKey: string | null }).captureKey;
};

beforeEach(() => {
  resetBackend();
  sessionStorage.clear();
  backend.createItem.mockResolvedValue("item-1");
});
afterEach(cleanup);

describe("CaptureBar", () => {
  it("disables Save for blank input", () => {
    render_();
    expect(save().disabled).toBe(true);
    type("  \n ");
    expect(save().disabled).toBe(true);
    type("x");
    expect(save().disabled).toBe(false);
  });

  it("saves a link, clears the draft, announces and refocuses", async () => {
    render_();
    type("https://example.com/a");
    await click();
    expect(backend.createItem).toHaveBeenCalledWith({
      originalInput: "https://example.com/a",
      inputType: "url",
      captureSource: "web",
      captureKey: expect.any(String),
    });
    expect(box().value).toBe("");
    expect(sessionStorage.length).toBe(0);
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(document.activeElement).toBe(box());
  });

  it("stores a note's whitespace verbatim", async () => {
    render_();
    const note = "  first line\n\n    second line  \n";
    type(note);
    await click();
    expect(backend.createItem.mock.calls[0]![0]).toMatchObject({
      originalInput: note,
      inputType: "text",
    });
  });

  it("keeps input and key after a failure and reuses the key on retry", async () => {
    backend.createItem.mockRejectedValueOnce(
      new ConvexError({ code: "X", message: "Offline" }),
    );
    render_();
    type("remember this");
    await click();
    expect(screen.getByRole("alert").textContent).toBe("Offline");
    expect(box().value).toBe("remember this");
    const key = storedKey();
    expect(key).toBeTruthy();
    await click();
    const keys = backend.createItem.mock.calls.map((c) => c[0].captureKey);
    expect(keys).toEqual([key, key]);
    expect(box().value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a fallback message for unexpected errors and a new key after editing", async () => {
    backend.createItem.mockRejectedValueOnce(new Error("boom"));
    render_();
    type("one");
    await click();
    expect(screen.getByRole("alert").textContent).toMatch(/Could not save/);
    type("one two");
    expect(storedKey()).toBeNull();
    await click();
    const [first, second] = backend.createItem.mock.calls.map(
      (c) => c[0].captureKey,
    );
    expect(second).not.toBe(first);
  });

  it("does not erase newer input when an older save finishes", async () => {
    let finish!: () => void;
    backend.createItem.mockReturnValueOnce(
      new Promise<string>((resolve) => (finish = () => resolve("item-1"))),
    );
    render_();
    type("older");
    await click();
    type("newer");
    await act(async () => finish());
    expect(box().value).toBe("newer");
    expect(sessionStorage.length).toBe(1);
  });

  it("saves on Enter but not on Shift+Enter", async () => {
    render_();
    type("note");
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(backend.createItem).not.toHaveBeenCalled();
    await act(async () => void fireEvent.keyDown(box(), { key: "Enter" }));
    expect(backend.createItem).toHaveBeenCalledTimes(1);
  });

  it("blocks input over the limit with an inline message", () => {
    render_();
    type(`https://example.com/${"x".repeat(8192)}`);
    expect(screen.getByRole("alert").textContent).toMatch(/Links.*8,192/);
    expect(save().disabled).toBe(true);
    type("y ".repeat(50_001));
    expect(screen.getByRole("alert").textContent).toMatch(/Notes.*100,000/);
    expect(backend.createItem).not.toHaveBeenCalled();
  });
});
