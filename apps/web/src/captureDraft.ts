import { useEffect, useState } from "react";
import type { ItemInputType } from "@mindspool/schema";

export interface CaptureDraft {
  inputType: ItemInputType;
  originalInput: string;
  captureKey: string | null;
}
const emptyDraft: CaptureDraft = {
  inputType: "url",
  originalInput: "",
  captureKey: null,
};
function readDraft(key: string): CaptureDraft {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return emptyDraft;
    const record = value as Record<string, unknown>;
    if (
      (record.inputType !== "url" && record.inputType !== "text") ||
      typeof record.originalInput !== "string" ||
      record.originalInput.length > 100000 ||
      !(
        record.captureKey === null ||
        (typeof record.captureKey === "string" &&
          record.captureKey.trim() &&
          record.captureKey.length <= 128)
      )
    )
      return emptyDraft;
    return {
      inputType: record.inputType,
      originalInput: record.originalInput,
      captureKey: record.captureKey,
    };
  } catch {
    return emptyDraft;
  }
}
function forget(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Memory state still works when storage is unavailable. */
  }
}
export function useCaptureDraft(sessionKey: string) {
  const key = `mindspool:capture-draft:${sessionKey}`;
  const [draft, setDraft] = useState(() => readDraft(key));
  useEffect(() => {
    if (!draft.originalInput) {
      forget(key);
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* Keep the in-memory draft. */
    }
  }, [draft, key]);
  // This component survives Convex auth refresh, but unmounts on Clerk sign-out
  // or session changes. A page reload leaves sessionStorage available to restore.
  useEffect(() => () => forget(key), [key]);
  function captured(captureKey: string) {
    setDraft((current) =>
      current.captureKey === captureKey
        ? { ...emptyDraft, inputType: current.inputType }
        : current,
    );
  }
  return { draft, setDraft, captured };
}

export function clearOtherDrafts(sessionKey: string | null) {
  try {
    const activeKey = sessionKey
      ? `mindspool:capture-draft:${sessionKey}`
      : null;
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("mindspool:capture-draft:") && key !== activeKey)
        stale.push(key);
    }
    for (const key of stale) forget(key);
  } catch {
    /* Storage may be unavailable; session-scoped memory still works. */
  }
}
