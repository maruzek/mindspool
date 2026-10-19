import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  mcpConnectionFields,
  mcpDiagnosticFields,
  mcpRateBucketFields,
} from "./mcpValidators";
import {
  itemFields,
  itemLabelFields,
  labelFields,
  ownerStatsFields,
  runFields,
  visualCaptureFields,
  visualAttemptFields,
} from "./validators";

import {
  boardFields,
  elementFields,
  connectionFields,
  receiptFields,
} from "./boardValidators";

export default defineSchema({
  // Per-URL receipts outlive resource deletion, without growing the source document.
  tweetLinkReceipts: defineTable({
    ownerId: v.string(),
    tweetId: v.id("items"),
    urlKey: v.string(),
  }).index("by_owner_tweet_url", ["ownerId", "tweetId", "urlKey"]),
  visualCaptureMaintenance: defineTable({
    key: v.literal("storage"),
    cursor: v.union(v.string(), v.null()),
  }).index("by_key", ["key"]),
  visualCaptures: defineTable(visualCaptureFields)
    .index("by_owner_key", ["ownerId", "captureKey"])
    .index("by_state_expiry", ["state", "expiresAt"]),
  visualCaptureAttempts: defineTable(visualAttemptFields)
    .index("by_nonce", ["nonce"])
    .index("by_state_expiry", ["state", "expiresAt"]),
  mcpConnections: defineTable(mcpConnectionFields)
    .index("by_owner_client", ["ownerId", "clientId"])
    .index("by_owner", ["ownerId"])
    .index("by_subject", ["subject"]),
  mcpRateBuckets: defineTable(mcpRateBucketFields)
    .index("by_scope_key_window", ["scope", "key", "windowStart"])
    .index("by_expiry", ["expiresAt"]),
  mcpDiagnostics: defineTable(mcpDiagnosticFields)
    .index("by_expiry", ["expiresAt"])
    .index("by_connection", ["connectionId"]),
  boards: defineTable(boardFields).index("by_owner_label", [
    "ownerId",
    "labelId",
  ]),
  boardElements: defineTable(elementFields)
    .index("by_owner_board", ["ownerId", "boardId"])
    .index("by_owner_board_key", ["ownerId", "boardId", "key"])
    .index("by_owner_item", ["ownerId", "data.itemId"])
    .index("by_owner_board_item", ["ownerId", "boardId", "data.itemId"])
    .index("by_owner_column", ["ownerId", "boardId", "data.columnKey"]),
  boardConnections: defineTable(connectionFields)
    .index("by_pair", ["ownerId", "boardId", "pairKey"])
    .index("by_owner_board", ["ownerId", "boardId"])
    .index("by_owner_board_key", ["ownerId", "boardId", "key"])
    .index("by_source", ["ownerId", "boardId", "source"])
    .index("by_target", ["ownerId", "boardId", "target"]),
  boardReceipts: defineTable(receiptFields)
    .index("by_operation", ["ownerId", "boardId", "session", "sequence"])
    .index("by_expiry", ["expiresAt"]),
  processingRuns: defineTable(runFields).index("by_owner_item", [
    "ownerId",
    "itemId",
  ]),
  items: defineTable(itemFields)
    .index("by_owner", ["ownerId"])
    .index("by_owner_capture_key", ["ownerId", "captureKey"])
    .index("by_owner_url_key", ["ownerId", "urlKey"])
    .index("by_owner_from", ["ownerId", "fromItemId"])
    .index("by_owner_role_from", ["ownerId", "libraryRole", "fromItemId"])
    .index("by_owner_source", ["ownerId", "sourceKind"])
    .index("by_owner_review", ["ownerId", "needsReview"])
    .index("by_owner_review_source", ["ownerId", "needsReview", "sourceKind"])
    .index("by_owner_inbox", ["ownerId", "inbox"])
    .index("by_owner_inbox_source", ["ownerId", "inbox", "sourceKind"])
    .index("by_owner_role", ["ownerId", "libraryRole"])
    .index("by_owner_role_source", ["ownerId", "libraryRole", "sourceKind"])
    .index("by_owner_role_review", ["ownerId", "libraryRole", "needsReview"])
    .index("by_owner_role_review_source", [
      "ownerId",
      "libraryRole",
      "needsReview",
      "sourceKind",
    ])
    .index("by_owner_role_inbox", ["ownerId", "libraryRole", "inbox"])
    .index("by_owner_role_inbox_source", [
      "ownerId",
      "libraryRole",
      "inbox",
      "sourceKind",
    ])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: [
        "ownerId",
        "libraryRole",
        "sourceKind",
        "needsReview",
        "inbox",
      ],
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
    .index("by_owner_role_label_decision", [
      "ownerId",
      "libraryRole",
      "labelId",
      "manualDecision",
    ])
    .index("by_owner_role_label_source", [
      "ownerId",
      "libraryRole",
      "labelId",
      "manualDecision",
      "sourceKind",
    ])
    .index("by_owner_role_label_unsure", [
      "ownerId",
      "libraryRole",
      "labelId",
      "manualDecision",
      "unsure",
    ])
    .index("by_owner_role_label_unsure_source", [
      "ownerId",
      "libraryRole",
      "labelId",
      "manualDecision",
      "unsure",
      "sourceKind",
    ])
    .searchIndex("search_link", {
      searchField: "searchText",
      filterFields: [
        "ownerId",
        "libraryRole",
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
