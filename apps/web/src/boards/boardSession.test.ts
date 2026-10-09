import { expect, it } from "vitest";
import { BoardSession } from "./boardSession";
const empty = { elements: [], connections: [] };
const heading = {
  type: "set" as const,
  key: "h",
  data: { type: "heading" as const, text: "Hello", x: 10, y: 20, width: 300 },
};
it("serializes writes, retains drafts after failures and retries the same identity", async () => {
  const requests: unknown[] = [];
  let fail = true;
  const session = new BoardSession(empty, 0, "session", async (request) => {
    requests.push(request);
    if (fail) throw new Error("network");
    return {
      revision: request.expectedRevision + 1,
      session: request.session,
      sequence: request.sequence,
    };
  });
  session.submit([heading]);
  await session.idle();
  expect(session.snapshot.status).toBe("error");
  expect(session.snapshot.layout.elements[0]!.data).toMatchObject({
    text: "Hello",
  });
  session.receive(empty, 0);
  expect(session.snapshot.layout.elements).toHaveLength(1);
  fail = false;
  session.retry();
  await session.idle();
  expect(requests[1]).toEqual(requests[0]);
  expect(session.snapshot.status).toBe("saved");
});
it("reactive echoes cannot acknowledge pending work; conflicts retain it until explicit reload", async () => {
  let resolve!: (value: {
    revision: number;
    session: string;
    sequence: number;
  }) => void;
  const session = new BoardSession(
    empty,
    0,
    "session",
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  session.submit([heading]);
  session.receive(empty, 1);
  expect(session.snapshot.status).toBe("saving");
  expect(session.snapshot.layout.elements).toHaveLength(1);
  resolve({ revision: 1, session: "session", sequence: 1 });
  await session.idle();
  expect(session.snapshot.status).toBe("saved");
  const conflict = new BoardSession(empty, 0, "session", async () => {
    throw new Error("Board changed. Reload latest.");
  });
  conflict.submit([heading]);
  await conflict.idle();
  expect(conflict.snapshot.status).toBe("conflict");
  expect(conflict.snapshot.layout.elements).toHaveLength(1);
  conflict.receive(empty, 2);
  expect(conflict.snapshot.layout.elements).toHaveLength(1);
  conflict.reload(empty, 2);
  expect(conflict.snapshot.layout.elements).toHaveLength(0);
});
it("keeps an acknowledged layout when an older reactive snapshot was buffered", async () => {
  let resolve!: (value: {
    revision: number;
    session: string;
    sequence: number;
  }) => void;
  const session = new BoardSession(
    empty,
    0,
    "session",
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  session.submit([heading]);
  session.receive(empty, 0);
  resolve({ revision: 1, session: "session", sequence: 1 });
  await session.idle();
  expect(session.snapshot.revision).toBe(1);
  expect(session.snapshot.layout.elements).toHaveLength(1);
});
it("rebases a queued resize of a new placement onto its acknowledged membership token", async () => {
  let resolve!: (value: {
    revision: number;
    session: string;
    sequence: number;
    elements: typeof empty.elements;
  }) => void;
  const requests: Parameters<
    ConstructorParameters<typeof BoardSession>[3]
  >[0][] = [];
  const session = new BoardSession(empty, 0, "session", (request) => {
    requests.push(request);
    return requests.length === 1
      ? new Promise((r) => {
          resolve = r as typeof resolve;
        })
      : Promise.resolve({ revision: 2, session: "session", sequence: 2 });
  });
  session.submit([
    { type: "place", key: "card", itemId: "item" as never, x: 0, y: 0 },
  ]);
  const card = session.snapshot.layout.elements[0]!;
  session.submit([
    { type: "set", key: card.key, data: { ...card.data, width: 400 } },
  ]);
  resolve({
    revision: 1,
    session: "session",
    sequence: 1,
    elements: [
      { ...card, data: { ...card.data, membership: "real:0" } },
    ] as never,
  });
  await session.idle();
  expect(requests[1]?.operations[0]).toMatchObject({
    type: "set",
    data: { membership: "real:0" },
  });
  expect(session.snapshot.layout.elements[0]!.data.width).toBe(400);
});
it("does not let snapshot undo erase another session's acknowledged work", async () => {
  const requests: unknown[] = [];
  const session = new BoardSession(empty, 0, "session", async (request) => {
    requests.push(request);
    return {
      revision: request.expectedRevision + 1,
      session: request.session,
      sequence: request.sequence,
    };
  });
  session.submit([heading]);
  await session.idle();
  const remote = {
    elements: [
      ...session.snapshot.layout.elements,
      { key: "other", data: { ...heading.data, text: "Other session" } },
    ],
    connections: [],
  };
  session.receive(remote, 2);
  session.undo();
  await session.idle();
  expect(session.snapshot.layout.elements.map((e) => e.key)).toContain("other");
  expect(requests).toHaveLength(1);
  expect(session.history.canUndo).toBe(false);
});
it("retains an oversized rejected action until explicit reload, then accepts edits", async () => {
  const session = new BoardSession(empty, 0, "session", async (request) => {
    if (request.operations.length > 100) throw new Error("Too many operations");
    return {
      revision: request.expectedRevision + 1,
      session: request.session,
      sequence: request.sequence,
    };
  });
  session.submit(
    Array.from({ length: 101 }, (_, i) => ({ ...heading, key: `h${i}` })),
  );
  await session.idle();
  expect(session.snapshot.status).toBe("error");
  expect(session.snapshot.layout.elements).toHaveLength(101);
  session.reload(empty, 0);
  expect(session.snapshot.pending).toBe(false);
  session.submit([heading]);
  await session.idle();
  expect(session.snapshot.status).toBe("saved");
});
