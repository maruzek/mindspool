import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ItemCard } from "@mindspool/ui/components/mindspool/item-card";
import { ItemRow } from "@mindspool/ui/components/mindspool/item-row";
import { ItemThumb } from "@mindspool/ui/components/mindspool/item-thumb";
import { LabelTag } from "@mindspool/ui/components/mindspool/label-tag";
import { ProcessingStatus } from "@mindspool/ui/components/mindspool/processing-status";
import { SegmentedControl } from "@mindspool/ui/components/mindspool/segmented-control";

afterEach(cleanup);

describe("ItemRow", () => {
  const row = (selected?: boolean) => (
    <ItemRow
      thumb={<ItemThumb kind="link" />}
      title="Soup"
      source={<span>example.com</span>}
      status={<ProcessingStatus status="pending" />}
      labels={<LabelTag>Food</LabelTag>}
      date="4m"
      selected={selected}
      render={<a href="/library?item=1" />}
    />
  );
  it("renders through the render prop with all slots", () => {
    render(row());
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/library?item=1");
    for (const text of ["Soup", "example.com", "Processing…", "Food", "4m"])
      expect(link.textContent).toContain(text);
    expect(link.getAttribute("aria-current")).toBeNull();
  });
  it("marks the selected row", () => {
    render(row(true));
    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-current")).toBe("true");
    expect(link.hasAttribute("data-selected")).toBe(true);
  });
});

describe("ItemCard", () => {
  it("renders as a link and marks selection", () => {
    render(
      <ItemCard
        thumb={<ItemThumb kind="note" />}
        title="A note"
        labels={<LabelTag state="manual">+2</LabelTag>}
        selected
        render={<a href="/x" />}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.textContent).toContain("A note");
    expect(link.textContent).toContain("+2");
    expect(link.getAttribute("aria-current")).toBe("true");
  });
});

describe("ProcessingStatus", () => {
  it.each([
    ["not_started", "Saved — original stored"],
    ["pending", "Processing…"],
    ["failed", "Extraction failed — link kept"],
  ] as const)("%s reads %s", (status, text) => {
    render(<ProcessingStatus status={status} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("renders nothing once succeeded", () => {
    const { container } = render(<ProcessingStatus status="succeeded" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ItemThumb and SegmentedControl", () => {
  it("is decorative and tagged by kind", () => {
    const { container } = render(<ItemThumb kind="note" />);
    const thumb = container.firstElementChild!;
    expect(thumb.getAttribute("aria-hidden")).toBe("true");
    expect(thumb.getAttribute("data-kind")).toBe("note");
  });
  it("selects one option and ignores deselecting", () => {
    const seen: string[] = [];
    render(
      <SegmentedControl
        aria-label="Layout"
        value="list"
        onValueChange={(v) => seen.push(v)}
        options={[
          { value: "list", label: "List" },
          { value: "grid", label: "Grid" },
        ]}
      />,
    );
    screen.getByRole("button", { name: "Grid" }).click();
    screen.getByRole("button", { name: "List" }).click();
    expect(seen).toEqual(["grid"]);
  });
});
