import { useEffect, useRef } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { cn } from "cn";

type ImageViewerProps = {
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
 * are hotlinked and sent no referrer. With one image there is no navigation.
 */
function ImageViewer({
  images,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: ImageViewerProps) {
  const count = images.length;
  const last = count - 1;
  const swipeStart = useRef<number | null>(null);
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
            <DialogPrimitive.Close className="flex size-11 items-center justify-center outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-6">
              <XIcon aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-14 pb-4"
            onPointerDown={(event) => {
              swipeStart.current = event.clientX;
            }}
            onPointerUp={(event) => {
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
              if (event.target === event.currentTarget) onOpenChange(false);
            }}
          >
            {src && (
              <img
                key={src}
                src={src}
                alt={`Image ${index + 1} of ${count}`}
                referrerPolicy="no-referrer"
                draggable={false}
                className="max-h-full max-w-full object-contain select-none"
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
