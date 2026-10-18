export type CaptureRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export function pixelCrop(
  rect: CaptureRect,
  width: number,
  height: number,
  cssWidth: number,
  cssHeight: number,
): CaptureRect {
  const left = Math.max(0, Math.floor((rect.left * width) / cssWidth));
  const top = Math.max(0, Math.floor((rect.top * height) / cssHeight));
  const right = Math.min(
    width,
    Math.ceil(((rect.left + rect.width) * width) / cssWidth),
  );
  const bottom = Math.min(
    height,
    Math.ceil(((rect.top + rect.height) * height) / cssHeight),
  );
  if (right <= left || bottom <= top) throw new Error("image_unavailable");
  return { left, top, width: right - left, height: bottom - top };
}
/** Injected in the isolated world; all implementation dependencies are local. */
export function selectRegion(): Promise<CaptureRect | null> {
  return new Promise((resolve, reject) => {
    if (document.querySelector("[data-mindspool-region]")) {
      reject(new Error("capture_interrupted"));
      return;
    }
    const focus = document.activeElement;
    const host = document.createElement("div");
    host.dataset.mindspoolRegion = "";
    host.tabIndex = -1;
    host.setAttribute("role", "application");
    host.setAttribute("aria-label", "Select a capture area. Escape cancels.");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:none";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML =
      '<div style="position:absolute;inset:0;background:#0003"><p style="font:14px system-ui;background:#f8f6fb;color:#1e1330;padding:12px;margin:12px;display:inline-block">Drag to select an area. Escape cancels.</p></div>';
    const outline = document.createElement("div");
    outline.style.cssText =
      "position:absolute;box-sizing:border-box;border:2px solid #5b2fc9;background:#fff2;pointer-events:none";
    shadow.append(outline);
    document.documentElement.append(host);
    host.focus();
    let start: { x: number; y: number } | undefined;
    let done = false;
    const point = (event: PointerEvent) => ({
      x: Math.max(0, Math.min(innerWidth, event.clientX)),
      y: Math.max(0, Math.min(innerHeight, event.clientY)),
    });
    const rectangle = (end: { x: number; y: number }) => ({
      left: Math.min(start!.x, end.x),
      top: Math.min(start!.y, end.y),
      width: Math.abs(start!.x - end.x),
      height: Math.abs(start!.y - end.y),
    });
    const watchdog = setTimeout(
      () => finish(null, "capture_interrupted"),
      30_000,
    );
    async function finish(rect: CaptureRect | null, error?: string) {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      host.remove();
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", changed);
      window.removeEventListener("scroll", changed);
      document.removeEventListener("visibilitychange", hidden);
      if (focus instanceof HTMLElement && focus.isConnected)
        focus.focus({ preventScroll: true });
      if (error) {
        reject(new Error(error));
        return;
      }
      await Promise.race([
        new Promise<void>((r) =>
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame(() => requestAnimationFrame(() => r()))
            : setTimeout(r, 0),
        ),
        new Promise((r) => setTimeout(r, 100)),
      ]);
      resolve(rect);
    }
    function changed() {
      void finish(null, "page_changed");
    }
    function hidden() {
      if (document.hidden) changed();
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void finish(null);
      }
    }
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", changed);
    window.addEventListener("scroll", changed);
    document.addEventListener("visibilitychange", hidden);
    host.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      start = point(event);
      host.setPointerCapture?.(event.pointerId);
    });
    host.addEventListener("pointermove", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!start) return;
      const rect = rectangle(point(event));
      Object.assign(outline.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    });
    host.addEventListener("pointerup", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!start) return;
      const rect = rectangle(point(event));
      void finish(rect.width >= 1 && rect.height >= 1 ? rect : null);
    });
    host.addEventListener("pointercancel", () => void finish(null));
  });
}
