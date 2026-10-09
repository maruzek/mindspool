import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
it("owns endpoints, rejects reversed duplicates, persists settings and cleans incident edges", async () => {
  const a = convexTest(schema, modules).withIdentity({ subject: "alice" });
  const labelId = await a.mutation(api.labels.create, { name: "Edges" });
  const board = await a.mutation(api.boards.open, { labelId });
  const ids = [];
  for (let i = 0; i < 2; i++)
    ids.push(
      await a.mutation(api.items.create, {
        inputType: "text",
        originalInput: `Card ${i}`,
        captureKey: `${i}`,
        captureSource: "web",
      }),
    );
  await a.mutation(api.boardOperations.apply, {
    boardId: board._id,
    expectedRevision: 0,
    session: "one",
    sequence: 1,
    operations: ids.map((itemId, i) => ({
      type: "place" as const,
      key: `${i}`,
      itemId,
      x: 100 * i,
      y: 0,
    })),
  });
  const request = {
    boardId: board._id,
    expectedRevision: 1,
    session: "one",
    sequence: 2,
    operations: [
      {
        type: "edge" as const,
        key: "edge",
        data: {
          source: "0",
          target: "1",
          arrows: "both" as const,
          label: "Related",
          color: "accent" as const,
        },
      },
    ],
  };
  await a.mutation(api.boardOperations.apply, request);
  expect(
    (
      await a.query(api.boards.connections, {
        boardId: board._id,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page[0],
  ).toMatchObject({ label: "Related", arrows: "both" });
  await expect(
    a.mutation(api.boardOperations.apply, {
      ...request,
      expectedRevision: 2,
      sequence: 3,
      operations: [
        {
          ...request.operations[0]!,
          key: "duplicate",
          data: { ...request.operations[0]!.data, source: "1", target: "0" },
        },
      ],
    }),
  ).rejects.toThrow("connection");
  await expect(
    a.mutation(api.boardOperations.apply, {
      ...request,
      expectedRevision: 2,
      sequence: 4,
      operations: [
        {
          ...request.operations[0]!,
          data: { ...request.operations[0]!.data, source: "0", target: "0" },
        },
      ],
    }),
  ).rejects.toThrow("Self");
  await a.mutation(api.boardOperations.apply, {
    ...request,
    expectedRevision: 2,
    sequence: 5,
    operations: [{ type: "remove", key: "0" }],
  });
  expect(
    (
      await a.query(api.boards.connections, {
        boardId: board._id,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
});
