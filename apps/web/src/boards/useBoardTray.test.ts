import { expect, it } from "vitest";
import { trayArgs } from "./useBoardTray";
it("defaults to label newest and only applies selected labels in All library", () => {
  expect(trayArgs("board" as never, { trayLabel: "other" })).toEqual({
    boardId: "board",
    scope: "label",
    sort: "newest",
  });
  expect(
    trayArgs("board" as never, {
      trayScope: "all",
      traySort: "oldest",
      trayLabel: "other",
      q: "hi",
      review: 1,
    }),
  ).toMatchObject({
    labelId: "other",
    sort: "oldest",
    query: "hi",
    needsReview: true,
  });
});
