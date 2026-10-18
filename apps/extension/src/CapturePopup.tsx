import { useEffect, useRef, useState, type ReactNode } from "react";
import { browser } from "wxt/browser";
import { Button } from "@mindspool/ui/components/button";
import {
  CameraIcon,
  CropIcon,
  ScanLineIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { safeVisualUrl } from "@mindspool/schema";
import type {
  CaptureFailure,
  CaptureStatus,
  VisualCaptureRequest,
} from "./visualCapture";

const failures: Record<CaptureFailure, string> = {
  unsupported_page: "This page can’t be captured. Open a regular website.",
  permission_denied:
    "Capture permission was denied. Try again from the website.",
  image_unavailable:
    "That image is unavailable. Try capturing an area instead.",
  too_large: "This image exceeds 2 MiB. Try a smaller area.",
  page_changed:
    "The page changed during capture. Keep the target tab selected and try again.",
  capture_interrupted: "Capture was interrupted. Please try again.",
  signed_out: "Sign in to save this capture.",
  network: "Couldn’t finish saving. Check your connection.",
  unknown: "Couldn’t capture this page. Please try again.",
};
const phaseText = {
  idle: "Save a visual reference from this page.",
  selecting: "Drag to select an area. Escape cancels.",
  capturing: "Capturing…",
  encoding: "Preparing your image…",
  uploading: "Saving to your library…",
  saved: "Saved to your library.",
  cancelled: "Capture cancelled.",
  failed: "Capture failed.",
};
type Props = {
  auth: "loading" | "signed_in" | "signed_out" | "unconfigured";
  webUrl: string;
  account?: ReactNode;
  send?: (request: VisualCaptureRequest) => Promise<unknown>;
};
export function CapturePopup({
  auth,
  webUrl,
  account,
  send = (request) => browser.runtime.sendMessage(request),
}: Props) {
  const [status, setStatus] = useState<CaptureStatus>({ state: "idle" });
  const [page, setPage] = useState({ title: "Current page", supported: true });
  const [launching, setLaunching] = useState(false);
  const launch = useRef(false);
  // Keep one stable transport even when the default function is recreated on render.
  const transport = useRef(send);
  transport.current = send;
  useEffect(() => {
    let live = true;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (live)
          setPage({
            title: tab?.title?.slice(0, 300) || "Current page",
            supported: Boolean(
              tab?.url &&
              safeVisualUrl(tab.url) &&
              !["chromewebstore.google.com", "addons.mozilla.org"].includes(
                new URL(tab.url).hostname,
              ),
            ),
          });
      });
    if (auth !== "signed_in")
      return () => {
        live = false;
      };
    async function refresh() {
      try {
        const value = await transport.current({
          type: "get-visual-capture-status",
        });
        if (
          live &&
          value &&
          typeof value === "object" &&
          "state" in value &&
          String(value.state) in phaseText
        )
          setStatus(value as CaptureStatus);
      } catch {
        if (live) setStatus({ state: "failed", error: "network" });
      }
    }
    void refresh();
    const timer = setInterval(refresh, 500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [auth]);
  const busy =
    launching ||
    ["selecting", "capturing", "encoding", "uploading"].includes(status.state);
  async function start(kind: "viewport" | "region" | "full-page") {
    if (launch.current || busy) return;
    launch.current = true;
    setLaunching(true);
    try {
      await transport.current({ type: "start-visual-capture", kind });
      setStatus({ state: "capturing", kind });
    } catch {
      setStatus({ state: "failed", error: "network" });
    } finally {
      launch.current = false;
      setLaunching(false);
    }
  }
  const itemUrl = new URL("/library", webUrl);
  if (status.itemId) itemUrl.searchParams.set("item", status.itemId);
  return (
    <main className="flex min-h-[280px] flex-col gap-5 p-5">
      <header className="flex items-center justify-between border-b-2 border-border pb-3">
        <h1 className="text-base font-extrabold tracking-tight">MindSpool</h1>
        {account}
      </header>
      <p className="truncate text-sm text-muted-foreground" title={page.title}>
        {page.title}
      </p>
      {auth === "signed_in" ? (
        <>
          <div className="flex flex-col gap-3">
            <Button
              className="h-12 w-full justify-center gap-2"
              disabled={busy || !page.supported}
              onClick={() => void start("viewport")}
            >
              <CameraIcon aria-hidden="true" />
              Capture visible area
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-10 justify-center gap-2"
                disabled={busy || !page.supported}
                onClick={() => void start("region")}
              >
                <CropIcon aria-hidden="true" />
                Select an area
              </Button>
              <Button
                variant="outline"
                className="h-10 justify-center gap-2"
                disabled={busy || !page.supported}
                onClick={() => void start("full-page")}
              >
                <ScanLineIcon aria-hidden="true" />
                Capture full page
              </Button>
            </div>
          </div>
          <p
            role={status.state === "failed" ? "alert" : "status"}
            aria-live="polite"
            aria-atomic="true"
            className="min-h-6 text-sm"
          >
            {!page.supported
              ? failures.unsupported_page
              : status.error
                ? failures[status.error]
                : phaseText[status.state]}
          </p>
          {status.state === "saved" && status.itemId && (
            <a
              className="text-sm font-bold text-primary underline"
              href={itemUrl.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              View saved reference
            </a>
          )}
        </>
      ) : auth === "loading" ? (
        <p role="status" className="text-sm">
          Loading sign-in…
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <a
            className="font-extrabold text-primary underline"
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign in to capture
          </a>
          <p className="text-sm text-muted-foreground">
            {auth === "unconfigured"
              ? "Sign-in is unavailable right now."
              : "Save screenshots to your MindSpool library."}
          </p>
        </div>
      )}
      {auth === "signed_in" && status.retryable && (
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await transport.current({ type: "retry-visual-capture" });
              setStatus((current) => ({
                ...current,
                state: "uploading",
                error: undefined,
                retryable: false,
              }));
            } catch {
              setStatus((current) => ({
                ...current,
                state: "failed",
                error: "network",
                retryable: true,
              }));
            }
          }}
        >
          Retry save
        </Button>
      )}
      {auth === "signed_in" && (busy || status.retryable) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void transport
              .current({ type: "cancel-visual-capture" })
              .catch(() =>
                setStatus((current) => ({
                  ...current,
                  state: "failed",
                  error: "network",
                })),
              )
          }
        >
          Cancel capture
        </Button>
      )}
      {auth === "signed_in" &&
        status.permissionOrigin &&
        status.error === "permission_denied" && (
          <div className="flex flex-col gap-2">
            <p className="break-all text-xs text-muted-foreground">
              Download the selected image from {status.permissionOrigin}, or
              capture an area instead.
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const origin = status.permissionOrigin!;
                if (!safeVisualUrl(origin) || new URL(origin).origin !== origin)
                  return;
                setLaunching(true);
                try {
                  const granted = await browser.permissions.request({
                    origins: [`${origin}/*`],
                  });
                  if (granted) {
                    await transport.current({ type: "retry-image-capture" });
                    setStatus({ state: "capturing", kind: "image" });
                  }
                } catch {
                  setStatus({
                    state: "failed",
                    error: "permission_denied",
                    permissionOrigin: origin,
                  });
                } finally {
                  setLaunching(false);
                }
              }}
            >
              Allow image download
            </Button>
          </div>
        )}
      <footer className="mt-auto border-t-2 border-border pt-3">
        <a
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"
          href={webUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open MindSpool
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
        </a>
      </footer>
    </main>
  );
}
