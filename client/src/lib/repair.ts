import { PDFDocument } from "pdf-lib";

/**
 * Repair PDF tries progressively heavier recovery, stopping at the first
 * result that opens cleanly and keeps the most pages:
 *
 * 1. qpdf structural rebuild: fixes broken cross-reference tables, bad
 *    offsets and truncated files. Text, fonts and quality stay as they were.
 * 2. pdf-lib copy: reads every page object it can find and writes them into
 *    a fresh document. Also lossless.
 * 3. Page images (last resort): PDF.js is very forgiving when drawing pages,
 *    so each page it can draw is captured as an image. The pages look right,
 *    but text can no longer be selected or searched.
 *
 * Each step is passed in so the logic can be tested without a browser.
 */

export type RepairMethod = "structure" | "rebuild" | "images";

export interface RepairResult {
  bytes: Uint8Array;
  method: RepairMethod;
  pages: number;
  /** Pages the original file claims to have, when that could be read. */
  expectedPages?: number;
}

export interface RepairSteps {
  structure?: (bytes: Uint8Array) => Promise<Uint8Array>;
  images?: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Counts pages in a candidate, throwing if it can't be opened. */
  countPages: (bytes: Uint8Array) => Promise<number>;
}

/** Lossless rebuild with pdf-lib: copies every readable page into a new file. */
export async function rebuildWithPdfLib(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
  const out = await PDFDocument.create();
  const indices = src.getPageIndices();
  if (!indices.length) throw new Error("No pages could be found in this file.");
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  const title = src.getTitle();
  if (title) out.setTitle(title);
  return out.save();
}

export async function repairPdf(bytes: Uint8Array, steps: RepairSteps): Promise<RepairResult> {
  const expectedPages = await steps.countPages(bytes).catch(() => undefined);
  const attempts: [RepairMethod, ((b: Uint8Array) => Promise<Uint8Array>) | undefined][] = [
    ["structure", steps.structure],
    ["rebuild", rebuildWithPdfLib],
    ["images", steps.images],
  ];
  let best: RepairResult | null = null;
  for (const [method, run] of attempts) {
    if (!run) continue;
    try {
      const out = await run(new Uint8Array(bytes));
      const pages = await steps.countPages(out);
      if (pages < 1) continue;
      if (!best || pages > best.pages) best = { bytes: out, method, pages, expectedPages };
      // A lossless result with every page is as good as it gets.
      if (method !== "images" && (expectedPages === undefined || pages >= expectedPages)) break;
      if (best.method !== "images" && best.pages >= (expectedPages ?? 0)) break;
    } catch {
      // Try the next method.
    }
  }
  if (!best) throw new Error("This file is too badly damaged to recover. It may not be a PDF, or it may be cut off very early.");
  return best;
}
