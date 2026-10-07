import type { ClipArgs } from "./clip";

export type ClipRequest = { type: "clip"; args: ClipArgs };

export type ClipFailure = "signed_out" | "invalid" | "network" | "unknown";

export type ClipResponse =
  { ok: true; itemId: string } | { ok: false; reason: ClipFailure };

export const isClipRequest = (message: unknown): message is ClipRequest =>
  typeof message === "object" &&
  message !== null &&
  (message as { type?: unknown }).type === "clip" &&
  typeof (message as { args?: unknown }).args === "object" &&
  (message as { args?: unknown }).args !== null;
