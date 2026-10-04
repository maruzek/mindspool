import type { Doc, Id } from "@mindspool/backend/data-model";

export function ItemList({
  items,
  onOpen,
}: {
  items: Doc<"items">[];
  onOpen: (id: Id<"items">) => void;
}) {
  if (!items.length)
    return (
      <p className="empty-state" role="status">
        No items here yet. Save a link or an idea to get started.
      </p>
    );
  return (
    <ul className="item-list">
      {items.map((item) => (
        <li key={item._id}>
          <button className="item-link" onClick={() => onOpen(item._id)}>
            <strong>
              {item.sourceMetadata?.title || item.originalInput.slice(0, 160)}
            </strong>
            <span>
              {item.inputType === "url" ? "Link" : "Text"} ·{" "}
              {new Date(item._creationTime).toLocaleDateString()}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
