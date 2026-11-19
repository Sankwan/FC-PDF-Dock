/**
 * Records when a PDF was signed with PDFDock, and later tells whether it has
 * been changed since, and when.
 *
 * On signing we write these entries into the PDF's document information:
 *   PDFDockSignedAt    the signing date and time
 *   PDFDockFingerprint a SHA-256 over the signing time and what's on each
 *                      page (drawing instructions, page size, annotations
 *                      and images), so changing either breaks the match
 *   PDFDockRecord      "2" (files from before this have no entry: their
 *                      fingerprint covers the pages only)
 * and set the file's "modified" date to the signing time.
 *
 * Checking recomputes the fingerprint. If it no longer matches, the pages
 * were changed after signing, and the file's own "modified" date (which
 * Acrobat, Word, Edge and this app all update when they save) says when.
 *
 * This is a change indicator for everyday use, not tamper-proof evidence:
 * someone who deliberately edits a file and rewrites these entries can hide
 * the change. Certificate-based signing (PAdES) is the tool for that.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFString } from "pdf-lib";

const KEY_SIGNED_AT = "PDFDockSignedAt";
const KEY_FINGERPRINT = "PDFDockFingerprint";
const KEY_VERSION = "PDFDockRecord";
const VERSION = "2";

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const streamBytes = (doc: PDFDocument, obj: unknown): Uint8Array[] => {
  const resolved = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (resolved instanceof PDFRawStream) return [resolved.contents];
  if (resolved instanceof PDFArray) return resolved.asArray().flatMap((o) => streamBytes(doc, o));
  return [];
};

/**
 * A digest of what each page shows. Other metadata doesn't affect it. With
 * `signedAt` (record version 2) the signing time and each annotation's own
 * entries are included too, so neither can be edited without breaking it.
 */
export const pageFingerprint = async (doc: PDFDocument, signedAt?: string): Promise<string> => {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  if (signedAt !== undefined) parts.push(enc.encode(`v2;signed:${signedAt};`));
  const pages = doc.getPages();
  parts.push(enc.encode(`pages:${pages.length};`));
  for (const page of pages) {
    const node = page.node;
    const { width, height } = page.getSize();
    parts.push(enc.encode(`size:${width.toFixed(2)}x${height.toFixed(2)};rot:${page.getRotation().angle};`));
    parts.push(...streamBytes(doc, node.get(PDFName.of("Contents"))));
    const annots = node.lookup(PDFName.of("Annots"));
    parts.push(enc.encode(`annots:${annots instanceof PDFArray ? annots.size() : 0};`));
    if (signedAt !== undefined && annots instanceof PDFArray) {
      for (const a of annots.asArray()) {
        const dict = a instanceof PDFRef ? doc.context.lookup(a) : a;
        // /P (parent page) and /AP (appearance streams) are left out: readers
        // rebuild them without the content changing.
        if (dict instanceof PDFDict) {
          const entries = dict.entries().filter(([k]) => !["/P", "/AP"].includes(k.asString())).map(([k, v]) => `${k.asString()} ${v.toString()}`);
          parts.push(enc.encode(`annot:${entries.sort().join(" ")};`));
        }
      }
    }
    const resources = node.lookup(PDFName.of("Resources"));
    const xobjects = resources instanceof PDFDict ? resources.lookup(PDFName.of("XObject")) : undefined;
    if (xobjects instanceof PDFDict) {
      for (const [key, value] of xobjects.entries()) {
        parts.push(enc.encode(`x:${key.decodeText()}`));
        const xo = value instanceof PDFRef ? doc.context.lookup(value) : value;
        if (xo instanceof PDFRawStream) parts.push(xo.contents);
      }
    }
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    all.set(p, off);
    off += p.length;
  }
  return toHex(await crypto.subtle.digest("SHA-256", all));
};

const infoDict = (doc: PDFDocument): PDFDict | undefined => {
  const ref = doc.context.trailerInfo.Info;
  const info = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
  return info instanceof PDFDict ? info : undefined;
};

const readText = (dict: PDFDict | undefined, key: string): string | undefined => {
  const v = dict?.lookup(PDFName.of(key));
  if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  return undefined;
};

/**
 * Adds the signing record to freshly saved PDF bytes. The fingerprint is
 * taken from the saved file, not the in-memory document, because pdf-lib
 * only encodes newly drawn content (the signature) when it saves.
 */
export const addSignRecord = async (savedBytes: Uint8Array, signedAt = new Date()): Promise<Uint8Array> => {
  const doc = await PDFDocument.load(savedBytes, { updateMetadata: false });
  const stamp = signedAt.toISOString();
  const fingerprint = await pageFingerprint(doc, stamp);
  doc.setModificationDate(signedAt);
  // setModificationDate creates the Info dictionary if it's missing.
  const info = infoDict(doc)!;
  info.set(PDFName.of(KEY_SIGNED_AT), PDFString.of(stamp));
  info.set(PDFName.of(KEY_FINGERPRINT), PDFString.of(fingerprint));
  info.set(PDFName.of(KEY_VERSION), PDFString.of(VERSION));
  return doc.save();
};

export type SignCheck =
  | { status: "no-record"; modifiedAt?: Date }
  | { status: "unchanged"; signedAt: Date; timeCovered: boolean }
  | { status: "changed"; signedAt: Date; modifiedAt?: Date };

export const checkSignRecord = async (file: File): Promise<SignCheck> => {
  // updateMetadata:false, or pdf-lib would stamp "modified: now" on load.
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false, ignoreEncryption: true });
  const info = infoDict(doc);
  const signedAtRaw = readText(info, KEY_SIGNED_AT);
  const fingerprint = readText(info, KEY_FINGERPRINT);
  const modifiedAt = doc.getModificationDate();
  if (!signedAtRaw || !fingerprint) return { status: "no-record", modifiedAt };
  const signedAt = new Date(signedAtRaw);
  // Older records don't cover the time, so it's reported as unconfirmed.
  const covered = readText(info, KEY_VERSION) === VERSION;
  const current = await pageFingerprint(doc, covered ? signedAtRaw : undefined);
  if (current === fingerprint && !Number.isNaN(signedAt.getTime())) return { status: "unchanged", signedAt, timeCovered: covered };
  // Only trust a modified date later than the signing time. PDF dates keep
  // whole seconds, so compare from the start of the next second.
  const signedSecond = Math.floor(signedAt.getTime() / 1000) * 1000;
  if (Number.isNaN(signedAt.getTime())) return { status: "no-record", modifiedAt };
  return { status: "changed", signedAt, modifiedAt: modifiedAt && modifiedAt.getTime() > signedSecond ? modifiedAt : undefined };
};

export const formatDateTime = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
