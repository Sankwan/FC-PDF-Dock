import type { Quad, ScanFilter } from './scanner';
import type { PageSize } from './scanExport';

export interface ScanPage {
  id: string;
  photo: Blob;
  photoW: number;
  photoH: number;
  quad: Quad;
  filter: ScanFilter;
  rotation: number;
  result?: Blob;
  resultUrl?: string;
  resultW?: number;
  resultH?: number;
}
export interface ScanDraft {
  version: 1;
  savedAt: number;
  pages: ScanPage[];
  editing: { page: ScanPage; isNew: boolean; fromCamera: boolean } | null;
  name: string;
  pageSize: PageSize;
  searchable: boolean;
}
export const DRAFT_LIFETIME = 24 * 60 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('fc-pdfdock-scans', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('drafts');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(new Error('This browser could not open local draft storage.'));
});
async function transaction(mode: IDBTransactionMode, value?: ScanDraft | null) {
  const db = await database();
  try {
    return await new Promise<ScanDraft | undefined>((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const store = tx.objectStore('drafts');
      const req = mode === 'readonly' ? store.get('current') : value ? store.put(value, 'current') : store.delete('current');
      let result: ScanDraft | undefined;
      req.onsuccess = () => { if (mode === 'readonly') result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('Draft could not be saved. Device storage may be full or blocked.'));
    });
  } finally { db.close(); }
}
export function writeScanDraft(value: ScanDraft | null) {
  const snapshot = value ? {
    ...value,
    pages: value.pages.map(({ resultUrl, ...page }) => page),
    editing: value.editing ? { ...value.editing, fromCamera: false, page: { ...value.editing.page, resultUrl: undefined } } : null,
  } : null;
  const next = queue.catch(() => undefined).then(() => transaction('readwrite', snapshot));
  queue = next;
  return next;
}
export async function readScanDraft() {
  await queue.catch(() => undefined);
  const draft = await transaction('readonly');
  if (!draft) return null;
  if (draft.version !== 1 || Date.now() - draft.savedAt > DRAFT_LIFETIME) {
    await writeScanDraft(null);
    return null;
  }
  return draft;
}
