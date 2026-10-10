import { describe, expect, it } from "vitest";
import { tagsOf } from "./tags";

const label = (id: string, name: string, unsure?: true) => ({
  _id: id as never,
  name,
  ...(unsure && { unsure }),
});

describe("tagsOf", () => {
  it("is empty for an unlabeled item", () => {
    expect(tagsOf({ labels: [], labelCount: 0 })).toEqual([]);
  });

  it("shows Labeling… first while a run is in flight", () => {
    expect(
      tagsOf({ labels: [label("a", "Space")], labelCount: 1, labeling: true }),
    ).toEqual([
      { key: "labeling", text: "Labeling…", state: "manual", busy: true },
      { key: "a", text: "Space", state: "confirmed" },
    ]);
  });

  it("styles unsure labels as suggested", () => {
    expect(
      tagsOf({ labels: [label("a", "Space", true)], labelCount: 1 }),
    ).toEqual([{ key: "a", text: "Space", state: "suggested" }]);
  });

  it("counts the labels that did not fit", () => {
    const labels = [label("a", "A"), label("b", "B"), label("c", "C")];
    const tags = tagsOf({ labels, labelCount: 7 });
    expect(tags.at(-1)).toEqual({ key: "extra", text: "+4", state: "manual" });
    expect(tags).toHaveLength(4);
  });
});
