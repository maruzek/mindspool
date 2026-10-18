import {
  VISUAL_LIMITS,
  safeVisualUrl,
  type CaptureContext,
  type VisualCaptureKind,
} from "@mindspool/schema";
import { pageContext } from "./pageContext";
import type { CaptureRect } from "./regionCapture";
import type { ImageTarget, ImageSource } from "./imageCapture";
import type { FullPageVisual } from "./fullPageCapture";
import {
  tokenSubject,
  type CaptureRecovery,
  type RetryCapture,
} from "./captureRecovery";
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
  ownerSubject?: string;
  captureId?: string;
  target?: Pick<PinnedPage, "tabId" | "windowId" | "documentId" | "pageUrl">;
  permissionOrigin?: string;
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
  tiles?: FullPageVisual["tiles"];
  viewportHeight?: number;
  sourceImage?: boolean;
  crop?: CaptureRect;
  target: "visual-processor";
  captureKey: string;
  dataUrl: string;
  cssWidth: number;
  cssHeight: number;
};
export type CaptureDependencies = {
  recovery?: CaptureRecovery;
  loadStatus?(): Promise<CaptureStatus | undefined>;
  abort?(
    page: NonNullable<CaptureStatus["target"]>,
    captureKey: string,
  ): Promise<void>;
  cancelCapture?(
    captureId: string,
    token: string,
  ): Promise<{ state: string; itemId?: string }>;
  fullPage?(
    page: PinnedPage,
    captureKey: string,
    signal?: AbortSignal,
  ): Promise<FullPageVisual>;
  image?(page: PinnedPage, target: ImageTarget): Promise<ImageSource>;
  select?(page: PinnedPage): Promise<CaptureRect | null>;
  getToken(): Promise<string | null>;
  page(target?: ImageTarget): Promise<PinnedPage>;
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
    signal?: AbortSignal,
  ): Promise<void>;
  finalize(captureId: string, token: string): Promise<string>;
  changed(status: CaptureStatus): Promise<void>;
};
export type VisualCaptureRequest =
  | { type: "retry-visual-capture" }
  | { type: "cancel-visual-capture" }
  | { type: "retry-image-capture" }
  | { type: "start-visual-capture"; kind: "viewport" | "region" | "full-page" }
  | { type: "get-visual-capture-status" };
export function isVisualCaptureRequest(
  value: unknown,
): value is VisualCaptureRequest {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return (
    value.type === "get-visual-capture-status" ||
    value.type === "retry-image-capture" ||
    value.type === "retry-visual-capture" ||
    value.type === "cancel-visual-capture" ||
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
    ).find((value) => new RegExp(`(^|[ :])${value}($|[ .])`).test(message)) ??
    "unknown"
  );
}
/** Owned by the background, with no dependency on the popup's lifetime. */
export function createVisualCapture(deps: CaptureDependencies) {
  let status: CaptureStatus = { state: "idle" },
    busy = false;
  let pendingImage: { target: ImageTarget; captureKey: string } | undefined;
  let record: RetryCapture | undefined;
  let abort = new AbortController();
  let persistence = Promise.resolve();
  function update(patch: Partial<CaptureStatus>) {
    status = { ...status, ...patch };
    const snapshot = { ...status };
    persistence = persistence
      .then(() => deps.changed(snapshot))
      .catch(() => {});
  }
  const check = () => {
    if (abort.signal.aborted) throw new Error("capture_interrupted");
  };
  async function tokenFor(value?: RetryCapture) {
    const token = await deps.getToken();
    if (!token) throw new Error("signed_out");
    if (value?.subject && tokenSubject(token) !== value.subject) {
      await deps.recovery?.remove(value.context.captureKey);
      record = undefined;
      status = { state: "failed", error: "signed_out", retryable: false };
      throw new Error("signed_out");
    }
    return token;
  }
  async function complete(itemId: string, value: RetryCapture) {
    status = {
      state: "saved",
      captureKey: value.context.captureKey,
      kind: value.context.kind,
      ownerSubject: value.subject,
      pageTitle: value.context.sourceMetadata?.title,
      itemId,
    };
    update({});
    await persistence;
    await deps.recovery?.remove(value.context.captureKey);
    record = undefined;
  }
  async function cancelRecord() {
    if (record) {
      record.cancelRequested = true;
      await deps.recovery?.save(record);
      if (record.captureId && deps.cancelCapture) {
        const response = await deps.cancelCapture(
          record.captureId,
          await tokenFor(record),
        );
        if (response.state === "complete" && response.itemId) {
          await complete(response.itemId, record);
          return;
        }
      }
      await deps.recovery?.remove(record.context.captureKey);
      record = undefined;
    }
    update({
      state: "cancelled",
      error: undefined,
      retryable: false,
      permissionOrigin: undefined,
    });
  }
  async function save(value: RetryCapture, restoreOnly = false) {
    record = value;
    if (value.expiresAt <= Date.now()) {
      await deps.recovery?.remove(value.context.captureKey);
      record = undefined;
      throw new Error("capture_interrupted");
    }
    if (value.cancelRequested) {
      await cancelRecord();
      return;
    }
    const token = await tokenFor(value);
    check();
    const session = await deps.begin(value.context, token);
    value.captureId = session.captureId;
    update({ captureId: session.captureId });
    await deps.recovery?.save(value);
    if (session.state === "complete" && session.itemId) {
      await complete(session.itemId, value);
      return;
    }
    if (["complete", "cancelled", "expired"].includes(session.state)) {
      await deps.recovery?.remove(value.context.captureKey);
      record = undefined;
      throw new Error("capture_interrupted");
    }
    check();
    if (restoreOnly && session.state !== "verified") {
      update({
        state: "failed",
        error: "capture_interrupted",
        retryable: true,
      });
      return;
    }
    update({
      state: "uploading",
      error: undefined,
      retryable: false,
      permissionOrigin: undefined,
    });
    if (session.state !== "verified")
      await deps.upload(session.captureId, value.visual, token, abort.signal);
    check();
    const itemId = await deps.finalize(
      session.captureId,
      await tokenFor(value),
    );
    await complete(itemId, value);
  }
  async function failed(
    error: unknown,
    target?: ImageTarget,
    captureKey?: string,
  ) {
    if (abort.signal.aborted) {
      try {
        await cancelRecord();
        return;
      } catch (cancelError) {
        error = cancelError;
      }
    }
    const failure = captureFailure(error);
    const permissionOrigin =
      failure === "permission_denied" && target && safeVisualUrl(target.srcUrl)
        ? new URL(target.srcUrl).origin
        : undefined;
    if (permissionOrigin && target && captureKey)
      pendingImage = { target, captureKey };
    update({
      state: "failed",
      error: failure,
      permissionOrigin,
      retryable: Boolean(
        deps.recovery &&
        record &&
        ["network", "capture_interrupted", "signed_out"].includes(failure),
      ),
    });
  }
  async function run(
    kind: VisualCaptureKind,
    captureKey: string,
    target?: ImageTarget,
  ) {
    try {
      const token = await tokenFor();
      check();
      const page = await deps.page(target);
      check();
      update({
        pageTitle: page.title,
        ownerSubject: tokenSubject(token),
        target: {
          tabId: page.tabId,
          windowId: page.windowId,
          documentId: page.documentId,
          pageUrl: page.pageUrl,
        },
      });
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
        check();
        if (!selection) {
          update({ state: "cancelled" });
          return;
        }
        crop = selection;
      }
      const source =
        kind === "image" && target && deps.image
          ? await deps.image(page, target)
          : undefined;
      if (kind === "image" && !source) throw new Error("image_unavailable");
      if (source) {
        context.isAnimationStill = source.isAnimationStill;
        if (target && safeVisualUrl(target.srcUrl))
          context.sourceImageUrl = target.srcUrl;
        if (source.entryUrl) context.entryUrl = source.entryUrl;
        if (source.designSiteUrl) context.designSiteUrl = source.designSiteUrl;
      }
      const fullPage =
        kind === "full-page" && deps.fullPage
          ? await deps.fullPage(page, captureKey, abort.signal)
          : undefined;
      if (kind === "full-page" && !fullPage)
        throw new Error("unsupported_page");
      check();
      const dataUrl =
        source?.dataUrl ??
        fullPage?.tiles[0]?.dataUrl ??
        (await deps.screenshot(page));
      check();
      update({ state: "encoding" });
      const visual = await deps.process({
        target: "visual-processor",
        captureKey,
        dataUrl,
        cssWidth: page.width,
        cssHeight: fullPage?.cssHeight ?? page.height,
        ...(crop ? { crop } : {}),
        ...(source ? { sourceImage: true } : {}),
        ...(fullPage
          ? { tiles: fullPage.tiles, viewportHeight: page.height }
          : {}),
      });
      if (fullPage) fullPage.tiles.length = 0;
      check();
      if (visual.bytes > VISUAL_LIMITS.bytes) throw new Error("too_large");
      const subject = tokenSubject(token) ?? "";
      if (deps.recovery && !subject) throw new Error("signed_out");
      record = {
        context,
        visual,
        subject,
        expiresAt: context.capturedAt + VISUAL_LIMITS.lifetimeMs,
      };
      await deps.recovery?.save(record);
      await save(record);
    } catch (error) {
      await failed(error, target, captureKey);
    } finally {
      busy = false;
    }
  }
  async function restore() {
    if (!deps.recovery && !deps.loadStatus) return;
    busy = true;
    try {
      const previous = await deps.loadStatus?.();
      const cached = await deps.recovery?.load();
      if (cached) {
        status = {
          state: "uploading",
          kind: cached.context.kind,
          captureKey: cached.context.captureKey,
          pageTitle: cached.context.sourceMetadata?.title,
        };
        await save(cached, true);
      } else if (previous) {
        const token = previous.ownerSubject ? await deps.getToken() : undefined;
        if (
          previous.ownerSubject &&
          tokenSubject(token ?? "") !== previous.ownerSubject
        ) {
          status = { state: "idle" };
          update({});
          return;
        }
        status = previous;
        if (
          ["capturing", "selecting", "encoding", "uploading"].includes(
            previous.state,
          ) ||
          previous.permissionOrigin ||
          previous.retryable
        ) {
          if (previous.target && previous.captureKey)
            await deps
              .abort?.(previous.target, previous.captureKey)
              .catch(() => {});
          update({
            state: "failed",
            error: "capture_interrupted",
            retryable: false,
            permissionOrigin: undefined,
          });
        }
      }
    } catch (error) {
      await failed(error);
    } finally {
      busy = false;
    }
  }
  const ready = restore();
  return {
    ready,
    status: () => ({ ...status }),
    start(kind: VisualCaptureKind, target?: ImageTarget) {
      if (busy && status.captureKey) return { captureKey: status.captureKey };
      if (status.captureKey)
        void deps.recovery?.remove(status.captureKey).catch(() => {});
      busy = true;
      record = undefined;
      pendingImage = undefined;
      abort = new AbortController();
      const captureKey = `visual:${crypto.randomUUID()}`;
      status = { state: "capturing", captureKey, kind };
      update({});
      void run(kind, captureKey, target);
      return { captureKey };
    },
    retry() {
      if (busy || !record || !status.retryable) return;
      busy = true;
      abort = new AbortController();
      void save(record)
        .catch((error) => failed(error))
        .finally(() => {
          busy = false;
        });
    },
    retryImage() {
      if (busy || !pendingImage) return;
      busy = true;
      abort = new AbortController();
      const { target, captureKey } = pendingImage;
      status = { state: "capturing", kind: "image", captureKey };
      update({});
      void run("image", captureKey, target);
    },
    cancel() {
      abort.abort();
      pendingImage = undefined;
      if (status.target && status.captureKey)
        void deps.abort?.(status.target, status.captureKey).catch(() => {});
      if (!busy) {
        busy = true;
        void cancelRecord()
          .catch((error) => failed(error))
          .finally(() => {
            busy = false;
          });
      }
    },
    expire() {
      if (!busy && record && record.expiresAt <= Date.now()) {
        void deps.recovery?.remove(record.context.captureKey).catch(() => {});
        record = undefined;
        update({
          state: "failed",
          error: "capture_interrupted",
          retryable: false,
        });
      }
    },
  };
}
