import type { FunctionReturnType } from "convex/server";
import type { api } from "@mindspool/backend/api";

export type ItemDetail = NonNullable<
  FunctionReturnType<typeof api.items.detail>
>;

export type ProcessingRun = FunctionReturnType<
  typeof api.processingRuns.listForItem
>["page"][number];
export type ItemLabel = FunctionReturnType<
  typeof api.itemLabels.listForItem
>["page"][number];
