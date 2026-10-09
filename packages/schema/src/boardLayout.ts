/** Shared ordered-column geometry. Application elements use absolute canvas coordinates. */
export const COLUMN_INSET = 16;
export const COLUMN_HEADER = 48;
export const COLUMN_GAP = 16;
export function columnPositions(
  column: { x: number; y: number; width: number },
  heights: number[],
) {
  let y = column.y + COLUMN_HEADER;
  return heights.map((height) => {
    const position = {
      x: column.x + COLUMN_INSET,
      y,
      width: column.width - COLUMN_INSET * 2,
    };
    y += height + COLUMN_GAP;
    return position;
  });
}
