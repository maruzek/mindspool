import { defineSchema, defineTable } from "convex/server";
import { itemFields, labelFields, runFields } from "./validators";
import { v } from "convex/values";

export default defineSchema({
  processingRuns: defineTable(runFields).index("by_owner_item", [
    "ownerId",
    "itemId",
  ]),
  items: defineTable(itemFields)
    .index("by_owner", ["ownerId"])
    .index("by_owner_capture_key", ["ownerId", "captureKey"]),
  labels: defineTable(labelFields).index("by_owner_name", [
    "ownerId",
    "normalizedName",
  ]),
  itemLabels: defineTable({
    ownerId: v.string(),
    itemId: v.id("items"),
    labelId: v.id("labels"),
    manualDecision: v.union(v.literal("include"), v.literal("exclude")),
    updatedAt: v.number(),
  })
    .index("by_owner_item_decision", ["ownerId", "itemId", "manualDecision"])
    .index("by_owner_label_decision", ["ownerId", "labelId", "manualDecision"])
    .index("by_owner_pair", ["ownerId", "itemId", "labelId"]),
});
