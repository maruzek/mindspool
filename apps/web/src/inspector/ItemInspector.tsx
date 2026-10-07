import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@mindspool/backend/api";
import { Skeleton } from "@mindspool/ui/components/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  useSidebar,
} from "@mindspool/ui/components/sidebar";
import { InspectorHeader } from "./InspectorHeader";
import { DeleteItemDialog } from "./DeleteItemDialog";
import { RunCard } from "./RunCard";
import { InspectorLabels } from "./InspectorLabels";
import { InspectorPreview } from "./InspectorPreview";

/**
 * Right-hand panel driven by `?item`. It has its own provider so it stays
 * independent of the left navigation: inline (a 380px column) from 1280px,
 * an overlay below that, and a full-width sheet under 768px.
 */
export function ItemInspector({
  itemId,
  onDeleted,
}: {
  itemId: string | undefined;
  onDeleted?: () => void;
}) {
  const navigate = useNavigate();
  const open = itemId !== undefined;
  const close = () => {
    // The selected row or card, if it is still there once the panel is gone.
    const selected = document.querySelector<HTMLElement>(
      'a[aria-current="true"]',
    );
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, item: undefined }),
      resetScroll: false,
    }).then(() => {
      // A deleted row is gone: fall back to the page so focus is not lost.
      const target = selected?.isConnected
        ? selected
        : document.getElementById("main");
      target?.focus();
    });
  };
  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => !next && close()}
      openMobile={open}
      onOpenMobileChange={(next) => !next && close()}
      keyboardShortcut={false}
      style={{ "--sidebar-width": "380px" } as React.CSSProperties}
      className="min-h-0 w-auto max-xl:[&_[data-slot=sidebar-gap]]:w-0"
    >
      {itemId !== undefined && <Backdrop onClose={close} />}
      <Sidebar
        side="right"
        variant="sidebar"
        collapsible="offcanvas"
        mobileWidth="100%"
        className="max-xl:shadow-lg"
      >
        {itemId !== undefined && (
          <Panel itemKey={itemId} onClose={close}>
            <Detail
              key={itemId}
              id={itemId}
              onClose={close}
              onDeleted={() => {
                close();
                onDeleted?.();
              }}
            />
          </Panel>
        )}
      </Sidebar>
    </SidebarProvider>
  );
}

function Detail({
  id,
  onClose,
  onDeleted,
}: {
  id: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const item = useQuery(api.items.detail, { id });
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <InspectorHeader item={item ?? undefined} onClose={onClose} />
      <SidebarContent className="p-4">
        {item === undefined ? (
          <Skeleton aria-label="Loading item" className="h-6 w-2/3" />
        ) : item === null ? (
          deleting ? null : (
            <div role="status" className="flex flex-col gap-1">
              <p className="text-sm">Not found</p>
              <p className="text-sm text-muted-foreground">
                That page or item does not exist, or it is not yours.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-6">
            <InspectorPreview item={item} />
            <InspectorLabels itemId={item._id} />
            <RunCard
              itemId={item._id}
              enrichmentStatus={item.enrichmentStatus}
            />
            <DeleteItemDialog
              itemId={item._id}
              onDeleting={setDeleting}
              onDeleted={onDeleted}
            />
          </div>
        )}
      </SidebarContent>
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Overlay mode (below 1280px, above the mobile sheet) is modal-like. */
function useOverlay() {
  const [overlay, setOverlay] = useState(
    () => !window.matchMedia("(min-width: 1280px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setOverlay(!query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return overlay;
}

/**
 * The labelled complementary region. Escape closes it; as an overlay it also
 * takes focus on open and keeps Tab inside. Inline it never moves focus.
 */
function Panel({
  itemKey,
  onClose,
  children,
}: {
  itemKey: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const overlay = useOverlay();
  const { isMobile } = useSidebar();
  useEffect(() => {
    if (overlay && !isMobile) ref.current?.focus();
  }, [overlay, isMobile, itemKey]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Popovers and dialogs are portaled: their keys are not ours.
    if (!ref.current?.contains(event.target as Node)) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab" && overlay) {
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div
      ref={ref}
      role="complementary"
      aria-label="Item inspector"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="dark-sidebar flex h-full min-h-0 flex-col text-foreground outline-none"
    >
      {children}
    </div>
  );
}

/** Overlay only: a transparent layer that keeps the list behind it inert. */
function Backdrop({ onClose }: { onClose: () => void }) {
  const overlay = useOverlay();
  const { isMobile } = useSidebar();
  if (!overlay || isMobile) return null;
  return (
    <div
      data-slot="inspector-backdrop"
      aria-hidden="true"
      className="fixed inset-0 z-[9]"
      onClick={onClose}
    />
  );
}
