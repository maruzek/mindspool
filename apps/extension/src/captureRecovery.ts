import {
  VISUAL_LIMITS,
  assertCaptureContext,
  type CaptureContext,
} from "@mindspool/schema";
import type { EncodedCapture } from "./visualCapture";
export type RetryCapture = {
  context: CaptureContext;
  visual: EncodedCapture;
  subject: string;
  expiresAt: number;
  captureId?: string;
  cancelRequested?: boolean;
};
export type CaptureRecovery = {
  load(): Promise<RetryCapture | null>;
  save(record: RetryCapture): Promise<void>;
  remove(captureKey: string): Promise<void>;
};
type StoredCapture = Omit<RetryCapture, "visual"> & {
  visual: Omit<EncodedCapture, "dataUrl">;
  blob: Blob;
};
/** Used only to avoid replaying an old account's intent into a new account. The server verifies JWTs. */
export function tokenSubject(token: string): string | undefined {
  try {
    const part = token.split(".")[1];
    if (!part) return undefined;
    const claims = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : undefined;
  } catch {
    return undefined;
  }
}
export function encodedBlob(visual: EncodedCapture): Blob {
  const match = visual.dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/,
  );
  if (!match || match[1] !== visual.contentType)
    throw new Error("image_unavailable");
  const bytes = Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0));
  if (bytes.length > VISUAL_LIMITS.bytes) throw new Error("too_large");
  return new Blob([bytes], { type: visual.contentType });
}
async function blobUrl(blob: Blob) {
  // FileReader isn't available in a Chrome service worker.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
/** One slot bounds local retention even when many intents fail. Never stores JWTs or raw tiles. */
export function indexedCaptureRecovery(): CaptureRecovery {
  async function open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("mindspool-visual-captures", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("retry");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("capture_interrupted"));
    });
  }
  async function transaction<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, result: (value: T) => void) => void,
  ) {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction("retry", mode);
      let result: T;
      tx.oncomplete = () => {
        database.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        database.close();
        reject(new Error("capture_interrupted"));
      };
      work(tx.objectStore("retry"), (value) => {
        result = value;
      });
    });
  }
  const remove = (captureKey: string) =>
    transaction<void>("readwrite", (store, result) => {
      const request = store.get("current");
      request.onsuccess = () => {
        if (
          (request.result as StoredCapture | undefined)?.context.captureKey ===
          captureKey
        )
          store.delete("current");
        result();
      };
    });
  return {
    remove,
    async save(record) {
      assertCaptureContext(record.context);
      const { dataUrl: _dataUrl, ...visual } = record.visual;
      const stored: StoredCapture = {
        ...record,
        visual,
        blob: encodedBlob(record.visual),
      };
      await transaction<void>("readwrite", (store, result) => {
        store.put(stored, "current");
        result();
      });
    },
    async load() {
      const stored = await transaction<StoredCapture | undefined>(
        "readonly",
        (store, result) => {
          const request = store.get("current");
          request.onsuccess = () => result(request.result);
        },
      );
      if (!stored) return null;
      if (
        stored.expiresAt <= Date.now() ||
        stored.blob.size > VISUAL_LIMITS.bytes
      ) {
        await remove(stored.context.captureKey);
        return null;
      }
      assertCaptureContext(stored.context);
      const { blob, ...record } = stored;
      return {
        ...record,
        visual: { ...stored.visual, dataUrl: await blobUrl(blob) },
      };
    },
  };
}
