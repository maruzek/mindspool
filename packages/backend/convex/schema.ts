import { defineSchema, defineTable } from "convex/server";
import { itemFields } from "./validators";

export default defineSchema({
  items: defineTable(itemFields)
    .index("by_owner", ["ownerId"])
    .index("by_owner_capture_key", ["ownerId", "captureKey"]),
});
