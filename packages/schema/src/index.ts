export type DecisionProviderId =
  "jev" | "clef" | "clef-flash" | "openai-decisions";

export type CaptureSource = "web" | "mobile" | "extension";

export type ItemInputType = "url" | "text";
export type EnrichmentStatus =
  "not_started" | "pending" | "succeeded" | "failed";
export type ManualLabelDecision = "include" | "exclude";
export type ProcessingRunStatus = "pending" | "succeeded" | "failed";
export type InputModality = "text" | "image" | "text_image";
export type LabelOrigin = "manual" | "model";

/** Keep in sync with `LABEL_THRESHOLD`/`UNSURE_THRESHOLD`/`MAX_QUESTIONS` in backend `decisionProvider.ts`. */
export const UNSURE_THRESHOLD = 0.65;
export const MAX_LABEL_QUESTIONS = 64;

export * from "./reddit";
