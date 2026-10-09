import { measureBoard } from "./measureBoard";
import { useState, useSyncExternalStore, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { CanvasApi } from "../src/boards/BoardCanvas";
import type { BoardPreview, Element, Layout } from "../src/boards/types";
import type { LabelSearch } from "../src/search/searchParams";
import { BoardCanvas } from "../src/boards/BoardCanvas";
import { LibraryTray } from "../src/boards/LibraryTray";
import { BoardSession, applyOperations } from "../src/boards/boardSession";
import { TooltipProvider } from "@mindspool/ui/components/tooltip";
import "@mindspool/ui/globals.css";
const media =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#eae9e9"/><rect x="150" y="60" width="300" height="280" fill="#201e1d"/><rect x="160" y="70" width="140" height="140" fill="#ec3013"/><rect x="310" y="220" width="130" height="110" fill="#bab6b6"/></svg>',
  );
const count =
  new URLSearchParams(location.search).get("count") === "100" ? 100 : 4;
const elements: Element[] = Array.from({ length: count }, (_, i) => ({
  key: `card${i}`,
  data: {
    type: "item",
    itemId: `item${i}` as BoardPreview["itemId"],
    membership: "fixture",
    x: 160 + (i % 10) * 360,
    y: 120 + Math.floor(i / 10) * 370,
    width: 300,
    imageHeight: 200,
    textHeight: 120,
    mode: i % 2 ? "text" : "combined",
  },
}));
if (count === 100)
  for (let i = 0; i < 10; i++) {
    elements.push({
      key: `column${i}`,
      data: {
        type: "column",
        title: `Research ${i + 1}`,
        x: 150 + i * 360,
        y: 70,
        width: 332,
      },
    });
    for (let j = 0; j < 10; j++) {
      const card = elements[i + j * 10]!;
      if (card.data.type !== "item") continue;
      card.data.x = 166 + i * 360;
      card.data.y = 118 + j * ((i % 2 ? 120 : 320) + 16);
      card.data.columnKey = `column${i}`;
      card.data.order = j;
      card.data.freeWidth = 300;
      card.data.freeImageHeight = 200;
      card.data.freeTextHeight = 120;
    }
  }
const connections: Layout["connections"] = Array.from(
  { length: count === 100 ? 100 : 2 },
  (_, i) => ({
    key: `edge${i}`,
    source: `card${i % count}`,
    target: `card${(i + 1) % count}`,
    arrows: i % 3 === 0 ? "both" : i % 3 === 1 ? "end" : "none",
    label: i % 10 === 0 ? "Related" : "",
    color: i % 2 ? "ink" : "accent",
  }),
);
const previews: BoardPreview[] = Array.from({ length: count + 4 }, (_, i) => ({
  itemId: `item${i}` as BoardPreview["itemId"],
  title: `${i % 2 ? "Notes on spatial organization" : "Material study"} ${i + 1}`,
  body: "Collected ideas and references. Saved text stays intact while the board provides spatial organization.",
  source: i % 2 ? "note" : "web",
  imageUrl: i % 2 ? null : media,
  labels: [],
}));
const stats = { requests: 0, viewportWrites: 0 };
let serverLayout: Layout = { elements, connections };
const session = new BoardSession(
  { elements, connections },
  0,
  "fixture",
  async (request) => {
    stats.requests++;
    await new Promise((r) => setTimeout(r, 40));
    serverLayout = applyOperations(serverLayout, request.operations);
    const layout = serverLayout;
    return {
      revision: request.expectedRevision + 1,
      session: request.session,
      sequence: request.sequence,
      elements: layout.elements,
    };
  },
);
const fixture = {
  measure: measureBoard,
  session,
  stats,
  previews,
  reset: () => {
    serverLayout = { elements, connections };
    session.reload(serverLayout, 0);
  },
};
declare global {
  interface Window {
    __fixture: typeof fixture;
  }
}
window.__fixture = fixture;
function Fixture() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const canvas = useRef<CanvasApi>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [filters, setFilters] = useState<LabelSearch>({});
  return (
    <TooltipProvider>
      <div style={{ display: "flex", height: "100vh" }}>
        <aside
          className="dark-sidebar border-r-2 bg-sidebar text-sidebar-foreground"
          style={{ width: 60, flexShrink: 0, padding: 16 }}
        >
          m<br />▦
        </aside>
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="flex gap-3 border-b-2 px-5 py-3.5">
            <h1 className="text-base">Design references</h1>
            <span className="text-xs text-muted-foreground">
              Verification fixture · mocked transport
            </span>
          </header>
          <div className="relative min-h-0 flex-1">
            <BoardCanvas
              ref={canvas}
              layout={state.layout}
              previews={previews}
              viewport={viewport}
              disabled={state.status === "error"}
              submit={(ops) => session.submit(ops)}
              place={(itemId, point) =>
                session.submit([
                  { type: "place", key: crypto.randomUUID(), itemId, ...point },
                ])
              }
              open={() => {}}
              onViewport={(v) => {
                setViewport(v);
                stats.viewportWrites++;
              }}
              status={state.status}
              retry={() => session.retry()}
              reload={() => window.__fixture.reset()}
              undo={() => session.undo()}
              redo={() => session.redo()}
              canUndo={session.history.canUndo && !state.pending}
              canRedo={session.history.canRedo && !state.pending}
              create={(type, point) => {
                if (type !== "note")
                  session.submit([
                    {
                      type: "set",
                      key: crypto.randomUUID(),
                      data:
                        type === "column"
                          ? {
                              type: "column",
                              title: "New column",
                              width: 400,
                              ...point,
                            }
                          : {
                              type: "heading",
                              text: "Research",
                              width: 480,
                              ...point,
                            },
                    },
                  ]);
              }}
            />
          </div>
          <LibraryTray
            items={previews.slice(count)}
            status="Exhausted"
            filters={filters}
            onFilters={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            placed={
              new Set(
                state.layout.elements.flatMap((e) =>
                  e.data.type === "item" ? [e.data.itemId] : [],
                ),
              )
            }
            onAdd={(itemId) =>
              session.submit([
                {
                  type: "place",
                  key: crypto.randomUUID(),
                  itemId,
                  ...(canvas.current?.center() ?? { x: 0, y: 0 }),
                },
              ])
            }
            onLocate={() => {}}
            loadMore={() => {}}
            boardKey="verification"
            labels={[]}
            disabled={false}
          />
        </main>
      </div>
    </TooltipProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
