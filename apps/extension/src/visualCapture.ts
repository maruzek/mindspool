import {
  VISUAL_LIMITS,
  type CaptureContext,
  type VisualCaptureKind,
} from "@mindspool/schema";
import { pageContext } from "./pageContext";
import type { CaptureRect } from "./regionCapture";
export type CaptureFailure =
  | "unsupported_page"
  | "permission_denied"
  | "image_unavailable"
  | "too_large"
  | "page_changed"
  | "capture_interrupted"
  | "signed_out"
  | "network"
  | "unknown";
export type CapturePhase =
  | "idle"
  | "selecting"
  | "capturing"
  | "encoding"
  | "uploading"
  | "saved"
  | "cancelled"
  | "failed";
export type CaptureStatus = {
  state: CapturePhase;
  captureKey?: string;
  kind?: VisualCaptureKind;
  pageTitle?: string;
  itemId?: string;
  error?: CaptureFailure;
  retryable?: boolean;
};
export type PinnedPage = {
  head?: string;
  tabId: number;
  windowId: number;
  documentId: string;
  pageUrl: string;
  title: string;
  width: number;
  height: number;
  dpr: number;
};
export type EncodedCapture = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  contentType: "image/png" | "image/jpeg" | "image/webp";
};
export type ProcessorRequest = {
  crop?: CaptureRect;
  target: "visual-processor";
  captureKey: string;
  dataUrl: string;
  cssWidth: number;
  cssHeight: number;
};
export type CaptureDependencies = {
  select?(page: PinnedPage): Promise<CaptureRect | null>;
  getToken(): Promise<string | null>;
  page(): Promise<PinnedPage>;
  screenshot(page: PinnedPage): Promise<string>;
  process(request: ProcessorRequest): Promise<EncodedCapture>;
  begin(
    context: CaptureContext,
    token: string,
  ): Promise<{ captureId: string; state: string; itemId?: string }>;
  upload(
    captureId: string,
    visual: EncodedCapture,
    token: string,
  ): Promise<void>;
  finalize(captureId: string, token: string): Promise<string>;
  changed(status: CaptureStatus): Promise<void>;
};
export type VisualCaptureRequest =
  | { type: "start-visual-capture"; kind: "viewport" | "region" | "full-page" }
  | { type: "get-visual-capture-status" };
export function isVisualCaptureRequest(
  value: unknown,
): value is VisualCaptureRequest {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return (
    value.type === "get-visual-capture-status" ||
    (value.type === "start-visual-capture" &&
      "kind" in value &&
      ["viewport", "region", "full-page"].includes(String(value.kind)))
  );
}
export function captureFailure(error: unknown): CaptureFailure {
  const message = error instanceof Error ? error.message : "unknown";
  return (
    (
      [
        "unsupported_page",
        "permission_denied",
        "image_unavailable",
        "too_large",
        "page_changed",
        "capture_interrupted",
        "signed_out",
        "network",
      ] as const
    ).find((value) => value === message) ?? "unknown"
  );
}
/** Owned by the background, with no dependency on the popup's lifetime. */
export function createVisualCapture(deps: CaptureDependencies) {
  let status: CaptureStatus = { state: "idle" };
  let busy = false;
  function update(patch: Partial<CaptureStatus>) {
    status = { ...status, ...patch };
    void deps.changed({ ...status }).catch(() => {});
  }
  async function run(kind: VisualCaptureKind, captureKey: string) {
    try {
      if (kind !== "viewport" && kind !== "region")
        throw new Error("unsupported_page");
      const token = await deps.getToken();
      if (!token) throw new Error("signed_out");
      const page = await deps.page();
      update({ pageTitle: page.title });
      const context: CaptureContext = {
        captureKey,
        kind,
        pageUrl: page.pageUrl,
        capturedAt: Date.now(),
        sourceMetadata: {
          title: page.title.slice(0, VISUAL_LIMITS.metadata.title),
        },
        ...pageContext(page.pageUrl, page.head ?? ""),
      };
      let crop: CaptureRect | undefined;
      if (kind === "region") {
        update({ state: "selecting" });
        if (!deps.select) throw new Error("unsupported_page");
        const selection = await deps.select(page);
        if (!selection) {
          update({ state: "cancelled" });
          return;
        }
        crop = selection;
      }
      const dataUrl = await deps.screenshot(page);
      update({ state: "encoding" });
      const visual = await deps.process({
        target: "visual-processor",
        captureKey,
        dataUrl,
        cssWidth: page.width,
        cssHeight: page.height,
        ...(crop ? { crop } : {}),
      });
      if (visual.bytes > VISUAL_LIMITS.bytes) throw new Error("too_large");
      update({ state: "uploading" });
      const session = await deps.begin(context, token);
      if (session.state === "complete" && session.itemId) {
        update({ state: "saved", itemId: session.itemId });
        return;
      }
      await deps.upload(session.captureId, visual, token);
      const currentToken = await deps.getToken();
      if (!currentToken) throw new Error("signed_out");
      const itemId = await deps.finalize(session.captureId, currentToken);
      update({ state: "saved", itemId });
    } catch (error) {
      update({
        state: "failed",
        error: captureFailure(error),
        retryable: false,
      });
    } finally {
      busy = false;
    }
  }
  return {
    status: () => ({ ...status }),
    start(kind: VisualCaptureKind) {
      if (busy && status.captureKey) return { captureKey: status.captureKey };
      busy = true;
      const captureKey = `visual:${crypto.randomUUID()}`;
      status = { state: "capturing", captureKey, kind };
      update({});
      void run(kind, captureKey);
      return { captureKey };
    },
  };
}
