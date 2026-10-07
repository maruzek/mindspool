import type { FunctionReturnType } from "convex/server";
import type { api } from "@mindspool/backend/api";

export type ItemDetail = NonNullable<
  FunctionReturnType<typeof api.items.detail>
>;
