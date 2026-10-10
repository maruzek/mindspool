/// <reference types="node" />
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

const files = readdirSync(join(__dirname, "__fixtures__"));

describe("recorded X fixtures", () => {
  it("includes every case from the plan", () => {
    for (const name of [
      "text",
      "photo",
      "multi-photo",
      "video",
      "quote",
      "long",
      "long-photo",
    ])
      expect(files).toEqual(
        expect.arrayContaining([`fx-${name}.json`, `syn-${name}.json`]),
      );
  });

  it.each(
    files.filter((f) => f.endsWith(".json") && f !== "fx-malformed.json"),
  )("%s is JSON", (name) => {
    expect(() => JSON.parse(fixture(name))).not.toThrow();
  });

  it("keeps the malformed sample malformed", () => {
    expect(() => JSON.parse(fixture("fx-malformed.json"))).toThrow();
  });
});
