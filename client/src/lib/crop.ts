import { PDFDocument, degrees, rgb, type PDFPage } from "pdf-lib";
import { pagePlacer } from "./editor/exportPdf";
import { shownSize } from "./watermark";

/** Amounts to cut from each edge of the page as seen, in points. */
export interface Trim { top: number; right: number; bottom: number; left: number }

export const MM = 72 / 25.4;
export const NO_TRIM: Trim = { top: 0, right: 0, bottom: 0, left: 0 };

export const PAPER = {
  a4: { label: "A4", w: 595.28, h: 841.89 },
  a5: { label: "A5", w: 419.53, h: 595.28 },
  a3: { label: "A3", w: 841.89, h: 1190.55 },
  letter: { label: "Letter", w: 612, h: 792 },
  legal: { label: "Legal", w: 612, h: 1008 },
} as const;
export type PaperSize = keyof typeof PAPER;

/** Keeps at least a fifth of the page in each direction. */
export const clampTrim = (t: Trim, width: number, height: number): Trim => {
  const fit = (a: number, b: number, total: number) => {
    a = Math.max(0, a); b = Math.max(0, b);
    const max = total * 0.8;
    return a + b > max ? [(a / (a + b)) * max, (b / (a + b)) * max] : [a, b];
  };
  const [left, right] = fit(t.left, t.right, width);
  const [top, bottom] = fit(t.top, t.bottom, height);
  return { top, right, bottom, left };
};

/** Shrinks what the page shows (its crop and media box) by the trim. */
export const cropPage = (page: PDFPage, trim: Trim) => {
  const { width, height } = shownSize(page);
  const t = clampTrim(trim, width, height);
  if (!t.top && !t.right && !t.bottom && !t.left) return;
  const { at } = pagePlacer(page);
  const a = at(t.left, t.top);
  const b = at(width - t.right, height - t.bottom);
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
  page.setMediaBox(x, y, w, h);
  page.setCropBox(x, y, w, h);
};

/** trims: one for every page, or a single one used for all. */
export const applyCrop = (doc: PDFDocument, trims: Trim | Trim[], firstPage = 1) => {
  doc.getPages().forEach((page, i) => cropPage(page, Array.isArray(trims) ? trims[firstPage - 1 + i] ?? NO_TRIM : trims));
};

/** Draws a page (as embedded) into a box on a sheet, scaled to fit, centred and upright. */
async function placeInBox(out: PDFDocument, target: PDFPage, page: PDFPage, box: { x: number; y: number; w: number; h: number }) {
  const crop = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const { width: sw, height: sh } = shownSize(page);
  const s = Math.min(box.w / sw, box.h / sh);
  const ox = box.x + (box.w - sw * s) / 2, oy = box.y + (box.h - sh * s) / 2;
  const embedded = await out.embedPage(page, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height });
  const w = crop.width * s, h = crop.height * s;
  const place = r === 90 ? { x: ox, y: oy + w, rotate: degrees(-90) }
    : r === 180 ? { x: ox + w, y: oy + h, rotate: degrees(180) }
    : r === 270 ? { x: ox + h, y: oy, rotate: degrees(90) }
    : { x: ox, y: oy, rotate: degrees(0) };
  target.drawPage(embedded, { ...place, xScale: s, yScale: s });
}

/**
 * Puts every page on the chosen paper size, scaled to fit and centred, in
 * the page's own orientation. Page content is kept as vector drawing, so
 * text stays sharp and searchable; links and form fields are not carried.
 */
export async function resizePages(src: PDFDocument, paper: PaperSize): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  const { w: pw, h: ph } = PAPER[paper];
  for (const page of src.getPages()) {
    const { width: sw, height: sh } = shownSize(page);
    const [tw, th] = sw > sh ? [ph, pw] : [pw, ph];
    await placeInBox(out, out.addPage([tw, th]), page, { x: 0, y: 0, w: tw, h: th });
  }
  return out;
}

export type PerSheet = 1 | 2 | 4;

/**
 * Several pages on each printed sheet, in reading order: 2 side by side on
 * a landscape sheet, or 4 in a 2 × 2 grid on a portrait one. Saves paper
 * for drafts and handouts.
 */
export async function pagesPerSheet(src: PDFDocument, paper: PaperSize, perSheet: 2 | 4): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  const { w: pw, h: ph } = PAPER[paper];
  const [tw, th] = perSheet === 2 ? [ph, pw] : [pw, ph];
  const cols = 2, rows = perSheet === 2 ? 1 : 2;
  const margin = 18, gap = 12;
  const cw = (tw - 2 * margin - gap * (cols - 1)) / cols;
  const ch = (th - 2 * margin - gap * (rows - 1)) / rows;
  const pages = src.getPages();
  for (let i = 0; i < pages.length; i += perSheet) {
    const sheet = out.addPage([tw, th]);
    for (let k = 0; k < perSheet && i + k < pages.length; k++) {
      const col = k % cols, row = Math.floor(k / cols);
      const box = { x: margin + col * (cw + gap), y: th - margin - (row + 1) * ch - row * gap, w: cw, h: ch };
      await placeInBox(out, sheet, pages[i + k], box);
      sheet.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
    }
  }
  return out;
}

/**
 * The same cut on every page: as much as can be cut from each side without
 * losing content on any page. Blank pages (null) don't count.
 */
export const commonTrim = (trims: (Trim | null)[]): Trim => {
  const real = trims.filter((t): t is Trim => !!t);
  if (!real.length) return NO_TRIM;
  const min = (k: keyof Trim) => Math.min(...real.map((t) => t[k]));
  return { top: min("top"), right: min("right"), bottom: min("bottom"), left: min("left") };
};

/**
 * Finds where the content stops on one page's pixels (luminance 0–255).
 * Built for scans as well as clean PDFs:
 * - "white" is relative to the page's own paper colour, so grey or yellowed
 *   scans work;
 * - a row or column only counts as content when enough of it is dark, so
 *   dust specks and stray dots don't stop the trim;
 * - dark bands touching the very edge (scanner lid shadows) are ignored.
 * Returns null for a blank page.
 */
export function contentBox(lum: Uint8Array, width: number, height: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Paper colour: the bright end of the histogram.
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  let acc = 0, paper = 255;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= lum.length * 0.3) { paper = v; break; } }
  const threshold = Math.min(235, paper - 28);
  const dark = (x: number, y: number) => lum[y * width + x] < threshold;
  const countCols = (ya: number, yb: number) => {
    const c = new Uint32Array(width);
    for (let y = ya; y <= yb; y++) for (let x = 0; x < width; x++) if (dark(x, y)) c[x]++;
    return c;
  };
  // Edge shadows: skip rows/columns at the border that are mostly dark.
  const edge = (counts: Uint32Array, len: number, from: number, step: number) => {
    let i = from, n = 0;
    while (n < counts.length * 0.06 && counts[i] > len * 0.6) { i += step; n++; }
    return i;
  };
  const span = (counts: Uint32Array, lo: number, hi: number, min: number) => {
    let a = -1, b = -1;
    for (let i = lo; i <= hi; i++) if (counts[i] >= min) { if (a < 0) a = i; b = i; }
    return [a, b];
  };
  const minCol = Math.max(2, Math.round(height * 0.004)), minRow = Math.max(2, Math.round(width * 0.004));
  // Columns first (to find side shadows), then rows inside them, then columns again inside those rows.
  let cols = countCols(0, height - 1);
  const x0 = edge(cols, height, 0, 1), x1 = edge(cols, height, width - 1, -1);
  const rowDark = new Uint32Array(height);
  for (let y = 0; y < height; y++) for (let x = x0; x <= x1; x++) if (dark(x, y)) rowDark[y]++;
  const y0 = edge(rowDark, x1 - x0 + 1, 0, 1), y1 = edge(rowDark, x1 - x0 + 1, height - 1, -1);
  const [minY, maxY] = span(rowDark, y0, y1, minRow);
  if (minY < 0) return null;
  cols = countCols(minY, maxY);
  const [minX, maxX] = span(cols, x0, x1, minCol);
  if (minX < 0 || minY < 0) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Finds the white margins around each page's content by drawing it small
 * and looking for where the content starts. Leaves `pad` points around.
 * Blank pages give null.
 */
export async function detectWhiteMargins(file: File, onProgress?: (done: number, total: number) => void, pad = 4 * MM): Promise<(Trim | null)[]> {
  const { loadPdfDocument } = await import("./pdfjs");
  const pdf = await loadPdfDocument(file);
  const trims: (Trim | null)[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = 600 / Math.max(base.width, base.height);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp } as any).promise;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.height = 0;
      const lum = new Uint8Array(width * height);
      for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
      const box = contentBox(lum, width, height);
      const k = 1 / scale;
      trims.push(box && {
        left: Math.max(0, box.minX * k - pad), top: Math.max(0, box.minY * k - pad),
        right: Math.max(0, (width - 1 - box.maxX) * k - pad), bottom: Math.max(0, (height - 1 - box.maxY) * k - pad),
      });
      onProgress?.(n, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }
  return trims;
}

/**
 * Redraws every page as a picture, so whatever was cut off (and any hidden
 * text) is gone for good. Text is no longer selectable afterwards.
 */
export async function flattenToImages(bytes: Uint8Array, onProgress?: (done: number, total: number) => void, dpi = 200): Promise<Uint8Array> {
  const { loadPdfDocument, renderPdfPageToCanvas } = await import("./pdfjs");
  const pdf = await loadPdfDocument(bytes);
  const out = await PDFDocument.create();
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const canvas = await renderPdfPageToCanvas(pdf, n, dpi / 72);
      const flat = document.createElement("canvas");
      flat.width = canvas.width; flat.height = canvas.height;
      const ctx = flat.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      const jpg = await out.embedJpg(flat.toDataURL("image/jpeg", 0.85));
      canvas.width = canvas.height = flat.width = flat.height = 0;
      out.addPage([width, height]).drawImage(jpg, { x: 0, y: 0, width, height });
      onProgress?.(n, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }
  return out.save();
}
