import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  itemFields,
  itemLabelFields,
  labelFields,
  ownerStatsFields,
  runFields,
} from "./validators";

export default defineSchema({
  processingRuns: defineTable(runFields).index("by_owner_item", [
    "ownerId",
    "itemId",
  ]),
  items: defineTable(itemFields)
    .index("by_owner", ["ownerId"])
    .index("by_owner_capture_key", ["ownerId", "captureKey"])
    .index("by_owner_source", ["ownerId", "sourceKind"])
    .index("by_owner_review", ["ownerId", "needsReview"])
    .index("by_owner_review_source", ["ownerId", "needsReview", "sourceKind"])
    .index("by_owner_inbox", ["ownerId", "inbox"])
    .index("by_owner_inbox_source", ["ownerId", "inbox", "sourceKind"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["ownerId", "sourceKind", "needsReview", "inbox"],
    }),
  labels: defineTable(labelFields).index("by_owner_name", [
    "ownerId",
    "normalizedName",
  ]),
  itemLabels: defineTable(itemLabelFields)
    .index("by_owner_item_decision", ["ownerId", "itemId", "manualDecision"])
    .index("by_owner_label_decision", ["ownerId", "labelId", "manualDecision"])
    .index("by_owner_pair", ["ownerId", "itemId", "labelId"])
    .index("by_owner_item_unsure", [
      "ownerId",
      "itemId",
      "manualDecision",
      "unsure",
    ])
    .index("by_owner_label_source", [
      "ownerId",
      "labelId",
      "manualDecision",
      "sourceKind",
    ])
    .index("by_owner_label_unsure", [
      "ownerId",
      "labelId",
      "manualDecision",
      "unsure",
    ])
    .index("by_owner_label_unsure_source", [
      "ownerId",
      "labelId",
      "manualDecision",
      "unsure",
      "sourceKind",
    ])
    .searchIndex("search_link", {
      searchField: "searchText",
      filterFields: [
        "ownerId",
        "labelId",
        "manualDecision",
        "sourceKind",
        "unsure",
      ],
    }),
  ownerStats: defineTable(ownerStatsFields).index("by_owner", ["ownerId"]),
  /** One row per owner per UTC day: the Workers AI neurons spent and held. */
  aiUsage: defineTable({
    ownerId: v.string(),
    day: v.string(),
    neurons: v.number(),
    reserved: v.number(),
    inputTokens: v.number(),
    runs: v.number(),
    backfilled: v.optional(v.boolean()),
  }).index("by_owner_day", ["ownerId", "day"]),
});
