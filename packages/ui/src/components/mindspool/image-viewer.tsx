import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { cn } from "cn";

type ImageViewerProps = {
  inspection?: { width: number; height: number };
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Horizontal travel, in px, that counts as a swipe. */
const SWIPE_DISTANCE = 50;

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "previous" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center bg-black/60 text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-6",
        side === "previous" ? "left-3" : "right-3",
      )}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only">
        {side === "previous" ? "Previous image" : "Next image"}
      </span>
    </button>
  );
}

/**
 * Full-height image carousel in a dialog: previous/next buttons, ← and → keys,
 * swipe, a "2 / 4" counter, and Escape or the close button to leave. Images
 * are sent no referrer. Visual references can opt into zoom and scrolling.
 */
function ImageViewer({
  images,
  index,
  onIndexChange,
  open,
  onOpenChange,
  inspection,
}: ImageViewerProps) {
  const count = images.length;
  const last = count - 1;
  const swipeStart = useRef<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const zoomed = Boolean(inspection && zoom !== "fit");
  useEffect(() => {
    setZoom("fit");
    if (viewport.current) {
      viewport.current.scrollTop = 0;
      viewport.current.scrollLeft = 0;
    }
  }, [open, index, images[index]]);
  const changeZoom = (factor: number) => {
    if (!inspection) return;
    const fit = Math.min(
      Math.max(1, (viewport.current?.clientWidth || innerWidth) - 112) /
        inspection.width,
      Math.max(1, (viewport.current?.clientHeight || innerHeight) - 16) /
        inspection.height,
    );
    setZoom(
      Math.max(0.001, Math.min(4, (zoom === "fit" ? fit : zoom) * factor)),
    );
  };
  const go = (next: number) => {
    if (next >= 0 && next <= last) onIndexChange(next);
  };

  // Warm the neighbours so stepping through feels instant.
  useEffect(() => {
    if (!open) return;
    for (const url of [images[index - 1], images[index + 1]]) {
      if (!url) continue;
      const preload = new Image();
      preload.referrerPolicy = "no-referrer";
      preload.src = url;
    }
  }, [open, images, index]);

  const src = images[index];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="image-viewer-overlay"
          className="fixed inset-0 z-[60] bg-black/90"
        />
        <DialogPrimitive.Popup
          data-slot="image-viewer"
          onKeyDown={(event) => {
            if (zoomed) return;
            if (event.key === "ArrowLeft") go(index - 1);
            else if (event.key === "ArrowRight") go(index + 1);
            else return;
            event.preventDefault();
          }}
          className="fixed inset-0 z-[60] flex h-dvh flex-col text-white outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Image viewer
          </DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center justify-between px-3">
            {count > 1 ? (
              <p aria-live="polite" className="text-sm tabular-nums">
                {index + 1} / {count}
              </p>
            ) : (
              <span />
            )}
            {inspection && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={zoom === "fit"}
                  className="px-2 py-1 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => setZoom("fit")}
                >
                  Fit
                </button>
                <button
                  type="button"
                  aria-pressed={zoom === 1}
                  className="px-2 py-1 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => setZoom(1)}
                >
                  100%
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  className="p-2 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => changeZoom(0.8)}
                >
                  <ZoomOutIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Zoom in"
                  className="p-2 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => changeZoom(1.25)}
                >
                  <ZoomInIcon className="size-4" />
                </button>
                <span aria-live="polite" className="w-12 text-xs tabular-nums">
                  {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
                </span>
              </div>
            )}
            <DialogPrimitive.Close className="flex size-11 items-center justify-center outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-6">
              <XIcon aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div
            ref={viewport}
            role={inspection ? "region" : undefined}
            aria-label={inspection ? "Scrollable image" : undefined}
            tabIndex={inspection ? 0 : undefined}
            className={cn(
              "relative min-h-0 flex-1 px-14 pb-4",
              zoomed
                ? "overflow-auto"
                : "flex touch-pan-y items-center justify-center",
            )}
            onPointerDown={(event) => {
              swipeStart.current = event.clientX;
            }}
            onPointerUp={(event) => {
              if (zoomed) return;
              const start = swipeStart.current;
              swipeStart.current = null;
              if (start === null) return;
              const travel = event.clientX - start;
              if (Math.abs(travel) > SWIPE_DISTANCE)
                go(travel < 0 ? index + 1 : index - 1);
            }}
            onPointerCancel={() => {
              swipeStart.current = null;
            }}
            onClick={(event) => {
              // A click on the empty area around the image closes the viewer.
              if (!zoomed && event.target === event.currentTarget)
                onOpenChange(false);
            }}
          >
            {src && (
              <img
                key={src}
                src={src}
                alt={`Image ${index + 1} of ${count}`}
                referrerPolicy="no-referrer"
                draggable={false}
                className={cn(
                  "object-contain select-none",
                  zoomed
                    ? "mx-auto block max-h-none max-w-none"
                    : "max-h-full max-w-full",
                )}
                style={
                  zoomed && inspection && typeof zoom === "number"
                    ? {
                        width: inspection.width * zoom,
                        height: inspection.height * zoom,
                      }
                    : undefined
                }
              />
            )}
            {count > 1 && (
              <>
                <NavButton
                  side="previous"
                  disabled={index === 0}
                  onClick={() => go(index - 1)}
                />
                <NavButton
                  side="next"
                  disabled={index === last}
                  onClick={() => go(index + 1)}
                />
              </>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { ImageViewer, type ImageViewerProps };
