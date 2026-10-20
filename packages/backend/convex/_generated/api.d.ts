/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiBudget from "../aiBudget.js";
import type * as aiUsage from "../aiUsage.js";
import type * as auth from "../auth.js";
import type * as boardColumns from "../boardColumns.js";
import type * as boardConnections from "../boardConnections.js";
import type * as boardOperations from "../boardOperations.js";
import type * as boardPreviews from "../boardPreviews.js";
import type * as boardState from "../boardState.js";
import type * as boardTray from "../boardTray.js";
import type * as boardValidators from "../boardValidators.js";
import type * as boards from "../boards.js";
import type * as clef from "../clef.js";
import type * as crons from "../crons.js";
import type * as decisionProvider from "../decisionProvider.js";
import type * as decisions from "../decisions.js";
import type * as enrichment from "../enrichment.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as itemImages from "../itemImages.js";
import type * as itemLabels from "../itemLabels.js";
import type * as itemState from "../itemState.js";
import type * as itemVisibility from "../itemVisibility.js";
import type * as items from "../items.js";
import type * as labels from "../labels.js";
import type * as libraryWriters from "../libraryWriters.js";
import type * as linkedItemStats from "../linkedItemStats.js";
import type * as mcp_auth from "../mcp/auth.js";
import type * as mcp_config from "../mcp/config.js";
import type * as mcp_discovery from "../mcp/discovery.js";
import type * as mcp_handler from "../mcp/handler.js";
import type * as mcp_proof from "../mcp/proof.js";
import type * as mcp_registry from "../mcp/registry.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as mcp_tools_excerpt from "../mcp/tools/excerpt.js";
import type * as mcp_tools_read from "../mcp/tools/read.js";
import type * as mcp_tools_shape from "../mcp/tools/shape.js";
import type * as mcp_tools_streams from "../mcp/tools/streams.js";
import type * as mcp_transport from "../mcp/transport.js";
import type * as mcp_types from "../mcp/types.js";
import type * as mcpConnections from "../mcpConnections.js";
import type * as mcpDiagnostics from "../mcpDiagnostics.js";
import type * as mcpDiscovery from "../mcpDiscovery.js";
import type * as mcpMaintenance from "../mcpMaintenance.js";
import type * as mcpRateLimit from "../mcpRateLimit.js";
import type * as mcpValidators from "../mcpValidators.js";
import type * as pageMetadata from "../pageMetadata.js";
import type * as processingRuns from "../processingRuns.js";
import type * as redditCaptureModel from "../redditCaptureModel.js";
import type * as sampleContent from "../sampleContent.js";
import type * as seed from "../seed.js";
import type * as tweetLinks from "../tweetLinks.js";
import type * as tweetResourceWriters from "../tweetResourceWriters.js";
import type * as tweetSourceMigration from "../tweetSourceMigration.js";
import type * as tweetSourceState from "../tweetSourceState.js";
import type * as validators from "../validators.js";
import type * as visualCaptureMaintenance from "../visualCaptureMaintenance.js";
import type * as visualCaptureState from "../visualCaptureState.js";
import type * as visualCaptureUpload from "../visualCaptureUpload.js";
import type * as visualCaptures from "../visualCaptures.js";
import type * as visualImageDecode from "../visualImageDecode.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiBudget: typeof aiBudget;
  aiUsage: typeof aiUsage;
  auth: typeof auth;
  boardColumns: typeof boardColumns;
  boardConnections: typeof boardConnections;
  boardOperations: typeof boardOperations;
  boardPreviews: typeof boardPreviews;
  boardState: typeof boardState;
  boardTray: typeof boardTray;
  boardValidators: typeof boardValidators;
  boards: typeof boards;
  clef: typeof clef;
  crons: typeof crons;
  decisionProvider: typeof decisionProvider;
  decisions: typeof decisions;
  enrichment: typeof enrichment;
  http: typeof http;
  identity: typeof identity;
  itemImages: typeof itemImages;
  itemLabels: typeof itemLabels;
  itemState: typeof itemState;
  itemVisibility: typeof itemVisibility;
  items: typeof items;
  labels: typeof labels;
  libraryWriters: typeof libraryWriters;
  linkedItemStats: typeof linkedItemStats;
  "mcp/auth": typeof mcp_auth;
  "mcp/config": typeof mcp_config;
  "mcp/discovery": typeof mcp_discovery;
  "mcp/handler": typeof mcp_handler;
  "mcp/proof": typeof mcp_proof;
  "mcp/registry": typeof mcp_registry;
  "mcp/tools": typeof mcp_tools;
  "mcp/tools/excerpt": typeof mcp_tools_excerpt;
  "mcp/tools/read": typeof mcp_tools_read;
  "mcp/tools/shape": typeof mcp_tools_shape;
  "mcp/tools/streams": typeof mcp_tools_streams;
  "mcp/transport": typeof mcp_transport;
  "mcp/types": typeof mcp_types;
  mcpConnections: typeof mcpConnections;
  mcpDiagnostics: typeof mcpDiagnostics;
  mcpDiscovery: typeof mcpDiscovery;
  mcpMaintenance: typeof mcpMaintenance;
  mcpRateLimit: typeof mcpRateLimit;
  mcpValidators: typeof mcpValidators;
  pageMetadata: typeof pageMetadata;
  processingRuns: typeof processingRuns;
  redditCaptureModel: typeof redditCaptureModel;
  sampleContent: typeof sampleContent;
  seed: typeof seed;
  tweetLinks: typeof tweetLinks;
  tweetResourceWriters: typeof tweetResourceWriters;
  tweetSourceMigration: typeof tweetSourceMigration;
  tweetSourceState: typeof tweetSourceState;
  validators: typeof validators;
  visualCaptureMaintenance: typeof visualCaptureMaintenance;
  visualCaptureState: typeof visualCaptureState;
  visualCaptureUpload: typeof visualCaptureUpload;
  visualCaptures: typeof visualCaptures;
  visualImageDecode: typeof visualImageDecode;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
