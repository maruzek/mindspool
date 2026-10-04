export type DecisionProviderId =
  "jev" | "clef" | "clef-flash" | "openai-decisions";

export type CaptureSource = "web" | "mobile" | "extension";

export type ItemInputType = "url" | "text";
export type EnrichmentStatus =
  "not_started" | "pending" | "succeeded" | "failed";
export type ManualLabelDecision = "include" | "exclude";
