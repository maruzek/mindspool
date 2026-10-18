import { VISUAL_LIMITS } from "@mindspool/schema";
import type { PinnedPage } from "./visualCapture";
export type FullPageCommand = {
  type: "start" | "scroll" | "inspect" | "restore";
  token: string;
  documentId: string;
  y?: number;
  hidePrevious?: boolean;
};
export type PageMeasurement = {
  width: number;
  height: number;
  viewportHeight: number;
  dpr: number;
  y: number;
  documentId: string;
};
export type FullPageVisual = {
  tiles: { dataUrl: string; y: number }[];
  cssWidth: number;
  cssHeight: number;
};
export function planTiles(
  width: number,
  height: number,
  viewport: number,
  scale: number,
) {
  if (
    ![width, height, viewport, scale].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    height * scale > VISUAL_LIMITS.edge ||
    width * scale > VISUAL_LIMITS.edge ||
    width * height * scale * scale > VISUAL_LIMITS.pixels ||
    Math.ceil(height / viewport) > VISUAL_LIMITS.tiles
  )
    throw new Error("too_large");
  return Array.from(
    new Set(
      Array.from({ length: Math.ceil(height / viewport) }, (_, index) =>
        Math.min(index * viewport, Math.max(0, height - viewport)),
      ),
    ),
  );
}
function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("capture_interrupted")),
        Math.max(0, milliseconds),
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
export async function captureFullPage(
  page: PinnedPage,
  token: string,
  deps: {
    control(command: FullPageCommand): Promise<PageMeasurement>;
    screenshot(page: PinnedPage): Promise<string>;
  },
  signal?: AbortSignal,
): Promise<FullPageVisual> {
  const deadline = Date.now() + VISUAL_LIMITS.durationMs;
  const check = (measurement: PageMeasurement) => {
    if (signal?.aborted || Date.now() >= deadline)
      throw new Error("capture_interrupted");
    if (
      measurement.documentId !== page.documentId ||
      measurement.width !== page.width ||
      measurement.viewportHeight !== page.height ||
      measurement.dpr !== page.dpr
    )
      throw new Error("page_changed");
    planTiles(page.width, measurement.height, page.height, page.dpr);
  };
  const control = (
    type: FullPageCommand["type"],
    extra: Partial<FullPageCommand> = {},
  ) =>
    bounded(
      deps.control({ type, token, documentId: page.documentId, ...extra }),
      deadline - Date.now(),
    );
  try {
    let measurement = await control("start");
    check(measurement);
    // Settle finite lazy-loaded content without hiding any layers before capture.
    for (let offset = 0, step = 0; ; offset += page.height, step++) {
      if (step >= VISUAL_LIMITS.tiles) throw new Error("too_large");
      measurement = await control("scroll", { y: offset, hidePrevious: false });
      check(measurement);
      if (measurement.y + page.height >= measurement.height) {
        const settled = await control("inspect", { hidePrevious: false });
        check(settled);
        if (settled.height === measurement.height) break;
      }
    }
    const height = measurement.height;
    const tiles: FullPageVisual["tiles"] = [];
    for (const y of planTiles(page.width, height, page.height, page.dpr)) {
      const position = await control("scroll", {
        y,
        hidePrevious: tiles.length > 0,
      });
      check(position);
      if (position.height !== height || Math.abs(position.y - y) > 1)
        throw new Error("page_changed");
      const dataUrl = await bounded(
        deps.screenshot(page),
        deadline - Date.now(),
      );
      const after = await control("inspect");
      check(after);
      if (after.height !== height || Math.abs(after.y - position.y) > 1)
        throw new Error("page_changed");
      tiles.push({ dataUrl, y: position.y });
    }
    return { tiles, cssWidth: page.width, cssHeight: height };
  } finally {
    await bounded(
      deps.control({ type: "restore", token, documentId: page.documentId }),
      1500,
    ).catch(() => {});
  }
}

/** Isolated-world page controller. The watchdog outlives a lost extension worker. */
export async function fullPageControl(
  request: FullPageCommand,
): Promise<PageMeasurement> {
  type Backup = {
    element: HTMLElement;
    property: string;
    value: string;
    priority: string;
  };
  type State = {
    token: string;
    url: string;
    lastY: number;
    restore(): void;
    candidates: HTMLElement[];
    backups: Backup[];
    timer?: ReturnType<typeof setTimeout>;
  };
  const scope = globalThis as typeof globalThis & {
    __mindspoolDocumentId?: string;
    __mindspoolFullPage?: State;
  };
  const measure = () => ({
    width: innerWidth,
    height:
      document.scrollingElement?.scrollHeight ??
      document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    dpr: devicePixelRatio,
    y: scrollY,
    documentId: scope.__mindspoolDocumentId ?? "",
  });
  if (request.type === "restore") {
    if (scope.__mindspoolFullPage?.token === request.token)
      scope.__mindspoolFullPage.restore();
    return measure();
  }
  if (scope.__mindspoolDocumentId !== request.documentId)
    throw new Error("page_changed");
  if (request.type === "start") {
    scope.__mindspoolFullPage?.restore();
    if (
      !document.body ||
      document.documentElement.scrollWidth > innerWidth + 4 ||
      document.querySelector("[data-mindspool-region]")
    )
      throw new Error("unsupported_page");
    const original = { x: scrollX, y: scrollY, url: location.href };
    const candidates: HTMLElement[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
    );
    for (
      let element = walker.currentNode, count = 0;
      element;
      element = walker.nextNode()!, count++
    ) {
      if (count > 5000) throw new Error("unsupported_page");
      if (!(element instanceof HTMLElement)) continue;
      const style = getComputedStyle(element),
        rect = element.getBoundingClientRect();
      if (["fixed", "sticky"].includes(style.position))
        candidates.push(element);
      if (
        ["auto", "scroll"].includes(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 2 &&
        rect.width > innerWidth * 0.75 &&
        rect.height > innerHeight * 0.75
      )
        throw new Error("unsupported_page");
    }
    const state: State = {
      token: request.token,
      url: original.url,
      lastY: scrollY,
      candidates,
      backups: [],
      restore() {
        clearTimeout(state.timer);
        if (
          location.href === original.url &&
          scope.__mindspoolDocumentId === request.documentId
        )
          scrollTo(original.x, original.y);
        for (const backup of state.backups.slice().reverse()) {
          if (backup.value)
            backup.element.style.setProperty(
              backup.property,
              backup.value,
              backup.priority,
            );
          else backup.element.style.removeProperty(backup.property);
        }
        if (scope.__mindspoolFullPage === state)
          delete scope.__mindspoolFullPage;
      },
    };
    for (const element of [document.documentElement, document.body])
      for (const property of ["scroll-behavior", "scroll-snap-type"]) {
        state.backups.push({
          element,
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        });
        element.style.setProperty(
          property,
          property === "scroll-behavior" ? "auto" : "none",
          "important",
        );
      }
    state.timer = setTimeout(state.restore, 30_000);
    scope.__mindspoolFullPage = state;
    return measure();
  }
  const state = scope.__mindspoolFullPage;
  if (!state || state.token !== request.token)
    throw new Error("capture_interrupted");
  if (
    state.url !== location.href ||
    (request.hidePrevious !== false && Math.abs(scrollY - state.lastY) > 1)
  )
    throw new Error("page_changed");
  if (request.type === "scroll") {
    if (request.hidePrevious)
      for (const element of state.candidates) {
        const rect = element.getBoundingClientRect();
        if (
          rect.top >= innerHeight ||
          rect.bottom <= 0 ||
          getComputedStyle(element).visibility === "hidden"
        )
          continue;
        if (
          !state.backups.some(
            (backup) =>
              backup.element === element && backup.property === "visibility",
          )
        )
          state.backups.push({
            element,
            property: "visibility",
            value: element.style.getPropertyValue("visibility"),
            priority: element.style.getPropertyPriority("visibility"),
          });
        element.style.setProperty("visibility", "hidden", "important");
      }
    scrollTo(0, request.y ?? 0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    state.lastY = scrollY;
  } else {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (request.hidePrevious === false) state.lastY = scrollY;
  }
  return measure();
}
