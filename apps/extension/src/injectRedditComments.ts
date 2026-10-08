import { parseRedditComment } from "./redditComment";
import type { RedditSelection } from "./redditSelection";

/** Checkbox state reflects the snapshot store, never the continued presence of its DOM node. */
export function redditCommentControls(
  doc: Document,
  selection: RedditSelection,
  changed: () => void,
) {
  const controls = new Map<
    Element,
    {
      label: HTMLLabelElement;
      input: HTMLInputElement;
      abort: AbortController;
      id: string;
    }
  >();
  const remove = (node: Element) => {
    const control = controls.get(node);
    control?.abort.abort();
    control?.label.remove();
    controls.delete(node);
  };
  const paint = () => {
    for (const control of controls.values()) {
      control.input.checked = selection.has(control.id);
      control.input.disabled = selection.isBusy;
    }
  };
  const sync = () => {
    for (const [node, control] of controls) {
      const parsed =
        selection.postId && parseRedditComment(node, selection.postId);
      if (
        !node.isConnected ||
        !parsed ||
        parsed.id !== control.id ||
        !control.label.isConnected
      )
        remove(node);
    }
    if (!selection.postId) return;
    for (const node of doc.querySelectorAll("shreddit-comment")) {
      const parsed = parseRedditComment(node, selection.postId);
      if (!parsed) continue;
      const row = [...node.querySelectorAll('[slot="actionRow"]')].find(
        (row) => row.closest("shreddit-comment") === node,
      );
      if (!row) continue;
      let control = controls.get(node);
      if (!control) {
        const label = doc.createElement("label");
        label.setAttribute("data-mindspool-reddit", "comment-control");
        label.style.cssText =
          "position:relative;z-index:5;display:inline-flex;align-items:center;gap:4px;margin-left:8px;font:13px system-ui,sans-serif;cursor:pointer";
        const input = doc.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-mindspool-reddit", "keep");
        label.append(input, doc.createTextNode("Keep comment"));
        const abort = new AbortController();
        control = { label, input, abort, id: parsed.id };
        controls.set(node, control);
        row.append(label);
        label.addEventListener("click", (event) => event.stopPropagation(), {
          signal: abort.signal,
        });
        input.addEventListener(
          "change",
          () => {
            const current =
              selection.postId && parseRedditComment(node, selection.postId);
            if (current && current.id === control!.id)
              selection.toggle(current, input.checked);
            changed();
            paint();
          },
          { signal: abort.signal },
        );
      }
      control.input.checked = selection.has(parsed.id);
      control.input.disabled = selection.isBusy;
    }
  };
  return {
    sync,
    paint,
    stop: () => {
      for (const node of controls.keys()) remove(node);
    },
  };
}
