import type { Layout, Operation } from "./types";
export function inverseOperations(
  current: Layout,
  target: Layout,
): Operation[] {
  const result: Operation[] = [];
  const elements = new Map(target.elements.map((e) => [e.key, e]));
  const edges = new Map(target.connections.map((e) => [e.key, e]));
  for (const edge of current.connections)
    if (!edges.has(edge.key))
      result.push({ type: "removeEdge", key: edge.key });
  for (const e of [...current.elements].sort(
    (a, b) =>
      Number(a.data.type === "column") - Number(b.data.type === "column"),
  ))
    if (!elements.has(e.key)) result.push({ type: "remove", key: e.key });
  for (const e of [...target.elements].sort(
    (a, b) =>
      Number(b.data.type === "column") - Number(a.data.type === "column"),
  )) {
    const existing = current.elements.find((row) => row.key === e.key);
    if (!existing || JSON.stringify(existing.data) !== JSON.stringify(e.data))
      result.push({ type: "restore", key: e.key, data: e.data });
  }
  for (const edge of target.connections) {
    const existing = current.connections.find((e) => e.key === edge.key);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(edge)) {
      const { key, ...data } = edge;
      result.push({ type: "edge", key, data });
    }
  }
  return result;
}
export class BoardHistory {
  private entries: { before: Layout; after: Layout }[] = [];
  private cursor = 0;
  get canUndo() {
    return this.cursor > 0;
  }
  get canRedo() {
    return this.cursor < this.entries.length;
  }
  get length() {
    return this.entries.length;
  }
  record(before: Layout, after: Layout) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.entries = this.entries.slice(0, this.cursor);
    this.entries.push({
      before: structuredClone(before),
      after: structuredClone(after),
    });
    if (this.entries.length > 100) this.entries.shift();
    this.cursor = this.entries.length;
  }
  peekUndo() {
    return this.entries[this.cursor - 1]?.before;
  }
  peekRedo() {
    return this.entries[this.cursor]?.after;
  }
  undo() {
    const result = this.peekUndo();
    if (result) this.cursor--;
    return result;
  }
  redo() {
    const result = this.peekRedo();
    if (result) this.cursor++;
    return result;
  }
  clear() {
    this.entries = [];
    this.cursor = 0;
  }
}
