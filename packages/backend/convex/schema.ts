import { defineSchema, defineTable } from "convex/server";
import {
  itemFields,
  itemLabelFields,
  labelFields,
  runFields,
} from "./validators";

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
  itemLabels: defineTable(itemLabelFields)
    .index("by_owner_item_decision", ["ownerId", "itemId", "manualDecision"])
    .index("by_owner_label_decision", ["ownerId", "labelId", "manualDecision"])
    .index("by_owner_pair", ["ownerId", "itemId", "labelId"]),
});
