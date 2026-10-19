import { expect, it } from "vitest";
import { modules } from "./test.setup";

// Module loading is suite setup, isolated from scheduled work in discovery fixtures.
const loaded = await Promise.all(Object.values(modules).map((load) => load()));

it("keeps owner selection out of every public function's argument schema", async () => {
  let inspected = 0;
  for (const module of loaded)
    for (const exported of Object.values(module as Record<string, unknown>)) {
      if (
        typeof exported === "function" &&
        "isPublic" in exported &&
        exported.isPublic === true &&
        "exportArgs" in exported &&
        typeof exported.exportArgs === "function"
      ) {
        const validator = JSON.parse(exported.exportArgs());
        expect(validator.value).not.toHaveProperty("ownerId");
        inspected++;
      }
    }
  expect(inspected).toBeGreaterThan(20);
});
