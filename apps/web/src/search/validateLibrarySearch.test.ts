import { describe, expect, it } from "vitest";
import { validateLibrarySearch } from "./searchParams";

describe("validateLibrarySearch", () => {
  it("keeps valid values and drops the rest", () => {
    expect(validateLibrarySearch({ layout: "grid", item: "abc" })).toEqual({
      layout: "grid",
      item: "abc",
    });
    expect(validateLibrarySearch({ layout: "tiles", item: 5 })).toEqual({});
    expect(validateLibrarySearch({ item: "" })).toEqual({});
  });
});
