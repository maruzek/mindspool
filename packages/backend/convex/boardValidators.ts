import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
export const viewport = v.object({
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
});
const geometry = { x: v.number(), y: v.number(), width: v.number() };
export const elementData = v.union(
  v.object({
    type: v.literal("item"),
    ...geometry,
    itemId: v.id("items"),
    membership: v.string(),
    mode: v.union(v.literal("combined"), v.literal("image"), v.literal("text")),
    imageHeight: v.number(),
    textHeight: v.number(),
    columnKey: v.optional(v.string()),
    order: v.optional(v.number()),
    freeWidth: v.optional(v.number()),
    freeImageHeight: v.optional(v.number()),
    freeTextHeight: v.optional(v.number()),
  }),
  v.object({ type: v.literal("column"), ...geometry, title: v.string() }),
  v.object({ type: v.literal("heading"), ...geometry, text: v.string() }),
);
export const elementFields = {
  ownerId: v.string(),
  boardId: v.id("boards"),
  key: v.string(),
  data: elementData,
};
export const connectionData = v.object({
  source: v.string(),
  target: v.string(),
  arrows: v.union(v.literal("none"), v.literal("end"), v.literal("both")),
  label: v.string(),
  color: v.union(v.literal("ink"), v.literal("accent"), v.literal("secondary")),
});
export const connectionFields = {
  pairKey: v.string(),
  ownerId: v.string(),
  boardId: v.id("boards"),
  key: v.string(),
  ...connectionData.fields,
};
export const boardFields = {
  ownerId: v.string(),
  labelId: v.id("labels"),
  revision: v.number(),
  viewport,
  updatedAt: v.number(),
};
export const boardDoc = v.object({
  _id: v.id("boards"),
  _creationTime: v.number(),
  ...boardFields,
});
export const elementDoc = v.object({
  _id: v.id("boardElements"),
  _creationTime: v.number(),
  ...elementFields,
});
export const connectionDoc = v.object({
  _id: v.id("boardConnections"),
  _creationTime: v.number(),
  ...connectionFields,
});
export const acknowledgment = v.object({
  elements: v.optional(
    v.array(v.object({ key: v.string(), data: elementData })),
  ),
  revision: v.number(),
  session: v.string(),
  sequence: v.number(),
  elementKey: v.optional(v.string()),
  itemId: v.optional(v.id("items")),
});
export const receiptFields = {
  ownerId: v.string(),
  boardId: v.id("boards"),
  session: v.string(),
  sequence: v.number(),
  fingerprint: v.string(),
  acknowledgment,
  expiresAt: v.number(),
};
export function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}
export function key(value: string) {
  if (!value || value.length > 100) invalid("Invalid key");
}
export function text(value: string) {
  if (!value.trim() || value.length > 200)
    invalid("Text must contain 1–200 characters");
}
export function finite(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max)
    invalid("Invalid geometry");
}
export function validateViewport(value: Infer<typeof viewport>) {
  finite(value.x, -1e6, 1e6);
  finite(value.y, -1e6, 1e6);
  finite(value.zoom, 0.25, 2);
}
export function validateElement(value: Infer<typeof elementData>) {
  finite(value.x, -1e6, 1e6);
  finite(value.y, -1e6, 1e6);
  finite(
    value.width,
    value.type === "heading" ? 80 : value.type === "column" ? 192 : 160,
    10000,
  );
  if (value.type === "item") {
    finite(value.imageHeight, 80, 10000);
    finite(value.textHeight, 80, 10000);
    if (value.freeWidth !== undefined) finite(value.freeWidth, 160, 10000);
    if (value.freeImageHeight !== undefined)
      finite(value.freeImageHeight, 80, 10000);
    if (value.freeTextHeight !== undefined)
      finite(value.freeTextHeight, 80, 10000);
    if (value.columnKey) key(value.columnKey);
    if (value.order !== undefined) {
      finite(value.order, 0, 1e6);
      if (!Number.isInteger(value.order)) invalid("Invalid order");
    }
  } else text(value.type === "column" ? value.title : value.text);
}
