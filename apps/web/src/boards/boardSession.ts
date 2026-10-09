import { removeColumn } from "./columnLayout";
import { BoardHistory, inverseOperations } from "./boardHistory";
import type { Layout, Operation } from "./types";
export function applyOperations(
  layout: Layout,
  operations: Operation[],
): Layout {
  const elements = new Map(layout.elements.map((e) => [e.key, e]));
  let connections = [...layout.connections];
  for (const op of operations) {
    if (op.type === "set" || op.type === "restore")
      elements.set(op.key, { key: op.key, data: op.data });
    else if (op.type === "place")
      elements.set(op.key, {
        key: op.key,
        data: {
          type: "item",
          x: op.x,
          y: op.y,
          width: 300,
          itemId: op.itemId,
          membership: "pending",
          mode: "combined",
          imageHeight: 200,
          textHeight: 120,
        },
      });
    else if (op.type === "edge") {
      connections = [
        ...connections.filter((e) => e.key !== op.key),
        { key: op.key, ...op.data },
      ];
    } else if (op.type === "removeEdge") {
      connections = connections.filter((e) => e.key !== op.key);
    } else if (op.type === "note") {
      /* Acknowledgment supplies the newly created placement. */
    } else if (op.type === "remove") {
      if (elements.get(op.key)?.data.type === "column") {
        const freed = removeColumn(op.key, [...elements.values()]);
        elements.clear();
        for (const element of freed) elements.set(element.key, element);
      }
      elements.delete(op.key);
      connections = connections.filter(
        (c) => c.source !== op.key && c.target !== op.key,
      );
    }
  }
  return { elements: [...elements.values()], connections };
}
type Request = {
  expectedRevision: number;
  session: string;
  sequence: number;
  operations: Operation[];
};
type Ack = {
  revision: number;
  session: string;
  sequence: number;
  elements?: Layout["elements"];
};
export interface SessionSnapshot {
  layout: Layout;
  revision: number;
  status: "saved" | "saving" | "error" | "conflict";
  pending: boolean;
  message?: string;
}
export class BoardSession {
  private base: Layout;
  private revision: number;
  private sequence = 0;
  private queue: {
    operations: Operation[];
    sequence: number;
    request?: Request;
    history?: "undo" | "redo";
  }[] = [];
  private listeners = new Set<() => void>();
  private running?: Promise<void>;
  private remote?: { layout: Layout; revision: number };
  readonly history = new BoardHistory();
  snapshot: SessionSnapshot;
  constructor(
    layout: Layout,
    revision: number,
    private session: string,
    private send: (request: Request) => Promise<Ack>,
  ) {
    this.base = layout;
    this.revision = revision;
    this.snapshot = { layout, revision, status: "saved", pending: false };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private emit(status: SessionSnapshot["status"], message?: string) {
    this.snapshot = {
      layout: this.queue.reduce(
        (layout, job) => applyOperations(layout, job.operations),
        this.base,
      ),
      revision: this.revision,
      status,
      pending: this.queue.length > 0,
      message,
    };
    for (const listener of this.listeners) listener();
  }
  submit(operations: Operation[]) {
    if (
      this.snapshot.status === "error" ||
      this.snapshot.status === "conflict" ||
      !operations.length
    )
      return;
    this.queue.push({ operations, sequence: ++this.sequence });
    this.emit("saving");
    this.pump();
  }
  receive(layout: Layout, revision: number) {
    if (revision < this.revision) return;
    if (this.queue.length) {
      this.remote = { layout, revision };
      return;
    }
    if (revision > this.revision) this.history.clear();
    this.base = layout;
    this.revision = revision;
    this.emit("saved");
  }
  undo() {
    this.replay("undo");
  }
  redo() {
    this.replay("redo");
  }
  private replay(kind: "undo" | "redo") {
    if (this.snapshot.status !== "saved" || this.queue.length) return;
    const target =
      kind === "undo" ? this.history.peekUndo() : this.history.peekRedo();
    if (!target) return;
    const operations = inverseOperations(this.base, target);
    if (!operations.length) {
      this.history[kind]();
      this.emit("saved");
      return;
    }
    this.queue.push({ operations, sequence: ++this.sequence, history: kind });
    this.emit("saving");
    this.pump();
  }
  retry() {
    if (this.snapshot.status !== "error") return;
    this.emit("saving");
    this.pump();
  }
  reload(layout: Layout, revision: number) {
    if (this.running) return;
    this.history.clear();
    this.queue = [];
    this.remote = undefined;
    if (revision > this.revision) this.history.clear();
    this.base = layout;
    this.revision = revision;
    this.emit("saved");
  }
  idle() {
    return this.running ?? Promise.resolve();
  }
  private pump() {
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
  }
  private async drain() {
    while (this.queue.length) {
      const job = this.queue[0]!;
      if (!job.request)
        job.operations = job.operations.map((op) => {
          if (
            op.type !== "set" ||
            op.data.type !== "item" ||
            op.data.membership !== "pending"
          )
            return op;
          const current = this.base.elements.find((e) => e.key === op.key);
          return current?.data.type === "item" &&
            current.data.itemId === op.data.itemId
            ? {
                ...op,
                data: { ...op.data, membership: current.data.membership },
              }
            : op;
        });
      job.request ??= {
        expectedRevision: this.revision,
        session: this.session,
        sequence: job.sequence,
        operations: job.operations,
      };
      try {
        const ack = await this.send(job.request);
        if (ack.session !== this.session || ack.sequence !== job.sequence)
          throw new Error("Invalid acknowledgment");
        const before = this.base;
        this.base = applyOperations(this.base, job.operations);
        this.revision = ack.revision;
        if (ack.elements)
          this.base = applyOperations(
            this.base,
            ack.elements.map((e) => ({ type: "set", ...e })),
          );
        if (job.history) this.history[job.history]();
        else this.history.record(before, this.base);
        this.queue.shift();
        if (this.remote && this.remote.revision < ack.revision)
          this.remote = undefined;
        if (this.remote && this.remote.revision === ack.revision) {
          this.base = this.remote.layout;
          this.remote = undefined;
        }
        if (
          this.remote &&
          this.remote.revision > ack.revision &&
          this.queue.length
        ) {
          this.emit("conflict", "Board changed. Reload latest.");
          return;
        }
        if (!this.queue.length && this.remote) {
          if (this.remote.revision > ack.revision) this.history.clear();
          this.base = this.remote.layout;
          this.revision = this.remote.revision;
          this.remote = undefined;
        }
        this.emit(this.queue.length ? "saving" : "saved");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not save";
        this.emit(
          message.includes("CONFLICT") || message.includes("Board changed")
            ? "conflict"
            : "error",
          message,
        );
        return;
      }
    }
  }
}
