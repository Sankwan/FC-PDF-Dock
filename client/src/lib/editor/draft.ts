import type { EditorObject } from "./types";

/**
 * Keeps an Edit PDF session in this browser so that a phone switching apps,
 * a closed tab or a crash doesn't lose the work. Same rules as scan drafts:
 * one draft per signed-in person, stored only on this device, removed after
 * 24 hours or when the person finishes or discards it.
 */

export interface EditDraft {
  version: 1;
  savedAt: number;
  file: Blob;
  name: string;
  objects: EditorObject[];
}

export const EDIT_DRAFT_LIFETIME = 24 * 60 * 60 * 1000;
const DB = "fc-pdfdock-edits";

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore("drafts");
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(new Error("Local draft storage is unavailable."));
});

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const req = work(tx.objectStore("drafts"));
      let result: T | undefined;
      req.onsuccess = () => { result = req.result as T; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error("Draft could not be saved."));
    });
  } finally {
    db.close();
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Saves (or with null, removes) the draft. Writes are queued so the last one wins. */
export const writeEditDraft = (draft: EditDraft | null, scope: string) => {
  const next = queue.catch(() => undefined).then(() => run("readwrite", (s) => (draft ? s.put(draft, scope) : s.delete(scope))));
  queue = next;
  return next;
};

export async function readEditDraft(scope: string): Promise<EditDraft | null> {
  await queue.catch(() => undefined);
  const draft = await run<EditDraft>("readonly", (s) => s.get(scope));
  if (!draft) return null;
  if (draft.version !== 1 || Date.now() - draft.savedAt > EDIT_DRAFT_LIFETIME || !draft.objects?.length) {
    await writeEditDraft(null, scope);
    return null;
  }
  return draft;
}
