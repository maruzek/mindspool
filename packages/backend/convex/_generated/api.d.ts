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
import type * as decisionProvider from "../decisionProvider.js";
import type * as decisions from "../decisions.js";
import type * as identity from "../identity.js";
import type * as itemLabels from "../itemLabels.js";
import type * as itemState from "../itemState.js";
import type * as items from "../items.js";
import type * as labels from "../labels.js";
import type * as libraryWriters from "../libraryWriters.js";
import type * as processingRuns from "../processingRuns.js";
import type * as redditCaptureModel from "../redditCaptureModel.js";
import type * as sampleContent from "../sampleContent.js";
import type * as seed from "../seed.js";
import type * as validators from "../validators.js";

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
  decisionProvider: typeof decisionProvider;
  decisions: typeof decisions;
  identity: typeof identity;
  itemLabels: typeof itemLabels;
  itemState: typeof itemState;
  items: typeof items;
  labels: typeof labels;
  libraryWriters: typeof libraryWriters;
  processingRuns: typeof processingRuns;
  redditCaptureModel: typeof redditCaptureModel;
  sampleContent: typeof sampleContent;
  seed: typeof seed;
  validators: typeof validators;
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
