import { browser } from "wxt/browser";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@mindspool/backend/api";
import type { Id } from "@mindspool/backend/data-model";
import { safeVisualUrl, VISUAL_LIMITS } from "@mindspool/schema";
import {
  createVisualCapture,
  type PinnedPage,
  type ProcessorRequest,
  type EncodedCapture,
} from "./visualCapture";
import { readRenderedPage } from "./pageContext";
import { selectRegion } from "./regionCapture";
import { downloadImage, selectedImageContext } from "./imageCapture";

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let lastScreenshot = 0;
let screenshots = Promise.resolve();
let processor: Promise<void> | undefined;

async function readPage(tabId: number, windowId: number): Promise<PinnedPage> {
  const tab = await browser.tabs.get(tabId);
  if (
    !tab.url ||
    !safeVisualUrl(tab.url) ||
    ["chromewebstore.google.com", "addons.mozilla.org"].includes(
      new URL(tab.url).hostname,
    )
  )
    throw new Error("unsupported_page");
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: readRenderedPage,
      args: [crypto.randomUUID()],
    });
    if (!injection?.result) throw new Error("unsupported_page");
    return { ...injection.result, tabId, windowId };
  } catch {
    throw new Error("unsupported_page");
  }
}
export async function assertPinned(page: PinnedPage) {
  const [active] = await browser.tabs.query({
    active: true,
    windowId: page.windowId,
  });
  if (active?.id !== page.tabId) throw new Error("page_changed");
  const current = await readPage(page.tabId, page.windowId).catch(() => {
    throw new Error("page_changed");
  });
  if (
    current.documentId !== page.documentId ||
    current.pageUrl !== page.pageUrl ||
    current.width !== page.width ||
    current.height !== page.height ||
    current.dpr !== page.dpr
  )
    throw new Error("page_changed");
}
async function screenshot(page: PinnedPage) {
  const operation = screenshots.then(async () => {
    await delay(
      Math.max(
        0,
        VISUAL_LIMITS.screenshotIntervalMs - (Date.now() - lastScreenshot),
      ),
    );
    await assertPinned(page);
    const image = await browser.tabs.captureVisibleTab(page.windowId, {
      format: "png",
    });
    lastScreenshot = Date.now();
    await assertPinned(page);
    return image;
  });
  screenshots = operation.then(
    () => {},
    () => {},
  );
  return operation;
}
async function ensureProcessor() {
  processor ??= (async () => {
    if (browser.offscreen) {
      if (!(await browser.offscreen.hasDocument()))
        await browser.offscreen.createDocument({
          url: "processor.html",
          reasons: [browser.offscreen.Reason.BLOBS],
          justification:
            "Decode and encode explicit webpage captures without keeping the popup open",
        });
    } else {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      const ready = new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error("image_unavailable"));
      });
      frame.src = browser.runtime.getURL("/processor.html");
      document.body.append(frame);
      await ready;
    }
  })().catch((error) => {
    processor = undefined;
    throw error;
  });
  return processor;
}
async function process(request: ProcessorRequest): Promise<EncodedCapture> {
  await ensureProcessor();
  const response = (await browser.runtime.sendMessage(request)) as
    { ok: boolean; visual?: EncodedCapture; reason?: string } | undefined;
  if (!response?.ok || !response.visual)
    throw new Error(response?.reason ?? "image_unavailable");
  return response.visual;
}

export function browserVisualCapture(getToken: () => Promise<string | null>) {
  const convexUrl = import.meta.env.WXT_PUBLIC_CONVEX_URL;
  const httpUrl =
    import.meta.env.WXT_PUBLIC_CONVEX_HTTP_URL ??
    convexUrl?.replace(/\.convex\.cloud\/?$/, ".convex.site");
  const client = (token: string) => {
    if (!convexUrl) throw new Error("network");
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(token);
    return convex;
  };
  const controller = createVisualCapture({
    getToken,
    page: async (target) => {
      if (target?.frameId && target.frameId !== 0)
        throw new Error("unsupported_page");
      const tab = target
        ? await browser.tabs.get(target.tabId)
        : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (tab?.id === undefined) throw new Error("unsupported_page");
      const page = await readPage(tab.id, tab.windowId);
      if (target && page.pageUrl !== target.pageUrl)
        throw new Error("page_changed");
      return page;
    },
    image: async (page, target) => {
      await assertPinned(page);
      const [injection] = await browser.scripting.executeScript({
        target: { tabId: page.tabId, frameIds: [0] },
        func: selectedImageContext,
        args:
          target.targetElementId === undefined
            ? [target.srcUrl]
            : [target.srcUrl, target.targetElementId],
      });
      await assertPinned(page);
      const local = injection?.result ?? {};
      if (local.dataUrl && local.width && local.height)
        return {
          ...local,
          dataUrl: local.dataUrl,
          width: local.width,
          height: local.height,
          isAnimationStill: true,
        };
      const source = await downloadImage(target.srcUrl, (origin) =>
        browser.permissions.contains({ origins: [`${origin}/*`] }),
      );
      await assertPinned(page);
      return {
        ...source,
        ...(local.entryUrl ? { entryUrl: local.entryUrl } : {}),
        ...(local.designSiteUrl ? { designSiteUrl: local.designSiteUrl } : {}),
      };
    },
    screenshot,
    select: async (page) => {
      await assertPinned(page);
      const [selection] = await browser.scripting.executeScript({
        target: { tabId: page.tabId, frameIds: [0] },
        func: selectRegion,
      });
      await assertPinned(page);
      return selection?.result ?? null;
    },
    process,
    begin: (context, token) =>
      client(token).mutation(api.visualCaptures.begin, { context }),
    upload: async (captureId, visual, token) => {
      if (!httpUrl) throw new Error("network");
      const blob = await (await fetch(visual.dataUrl)).blob();
      if (blob.size > VISUAL_LIMITS.bytes) throw new Error("too_large");
      const response = await fetch(
        `${httpUrl}/visual-captures/upload?captureId=${encodeURIComponent(captureId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": visual.contentType,
          },
          body: blob,
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        },
      ).catch(() => {
        throw new Error("network");
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "signed_out"
            : response.status === 413
              ? "too_large"
              : response.status === 409
                ? "capture_interrupted"
                : response.status === 415 || response.status === 422
                  ? "image_unavailable"
                  : "network",
        );
    },
    finalize: async (captureId, token) =>
      (
        await client(token).mutation(api.visualCaptures.finalize, {
          captureId: captureId as Id<"visualCaptures">,
        })
      ).itemId,
    changed: async (status) => {
      await browser.storage.local.set({ visualCaptureStatus: status });
      await browser.action.setBadgeText({
        text:
          status.state === "saved"
            ? "✓"
            : status.state === "failed"
              ? "!"
              : status.state === "idle" || status.state === "cancelled"
                ? ""
                : "…",
      });
      await browser.action.setBadgeBackgroundColor({ color: "#5b2fc9" });
    },
  });
  return controller;
}
