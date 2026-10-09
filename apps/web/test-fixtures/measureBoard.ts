/** Synthetic mouse/wheel input against the actual React Flow DOM, with mocked transport. */
export async function measureBoard() {
  const pane = document.querySelector(".react-flow__pane")!;
  const node = document.querySelector('[data-id="card0"]')!;
  const box = node.getBoundingClientRect();
  const x = box.x + 100,
    y = box.y + 30;
  const intervals: Record<"pan" | "drag", number[]> = { pan: [], drag: [] };
  let previous = 0,
    startedDrag = false,
    midRequests = 0;
  const began = performance.now();
  const before = { ...window.__fixture.stats };
  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const elapsed = now - began;
      if (previous)
        intervals[elapsed < 5000 ? "pan" : "drag"].push(now - previous);
      previous = now;
      if (elapsed < 5000)
        pane.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: Math.sin(elapsed / 400) * 3,
            deltaY: Math.cos(elapsed / 400) * 3,
            clientX: 900,
            clientY: 400,
          }),
        );
      else {
        if (!startedDrag) {
          midRequests = window.__fixture.stats.requests;
          node.dispatchEvent(
            new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: y,
            }),
          );
          startedDrag = true;
        }
        window.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1,
            clientX: x + Math.sin(elapsed / 600) * 70,
            clientY: y + Math.cos(elapsed / 600) * 35,
          }),
        );
      }
      if (elapsed < 10000) requestAnimationFrame(frame);
      else {
        window.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 0,
            clientX: x + 40,
            clientY: y + 25,
          }),
        );
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  function summarize(values: number[]) {
    values.sort((a, b) => a - b);
    return {
      frames: values.length,
      p95Ms: values[Math.ceil(values.length * 0.95) - 1],
      maxMs: values.at(-1),
    };
  }
  return {
    durationMs: performance.now() - began,
    pan: summarize(intervals.pan),
    drag: summarize(intervals.drag),
    all: summarize([...intervals.pan, ...intervals.drag]),
    before,
    midRequests,
    after: { ...window.__fixture.stats },
    renderedNodes: document.querySelectorAll(".react-flow__node").length,
    renderedEdges: document.querySelectorAll(".react-flow__edge").length,
  };
}
