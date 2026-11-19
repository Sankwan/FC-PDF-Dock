/**
 * Finds blank pages, such as the empty backs left by double-sided scanning.
 *
 * Each page is drawn small and greyscale. Scanner edges are ignored, the
 * paper colour is measured (scans are rarely pure white), and only marks
 * clearly darker than the paper count, so faint show-through from the other
 * side and dust specks don't make a page look used.
 */

export type Strictness = "empty" | "normal" | "nearly";

/** Share of the page that may carry marks and still count as blank. */
export const LIMITS: Record<Strictness, number> = { empty: 0.0006, normal: 0.003, nearly: 0.012 };

export interface PageCheck {
  page: number;
  /** share of the page with real marks on it (0–1) */
  ink: number;
  /** has selectable words beyond a page number */
  hasText: boolean;
  /** has any selectable text at all, even just a page number */
  anyText: boolean;
  /** only says "This page is intentionally left blank" (or similar) */
  saysBlank: boolean;
  thumb: string;
}

const CELL = 6;

/** Share of CELL×CELL blocks holding real marks, ignoring the outer edges. */
export function inkShare(lum: Uint8Array, width: number, height: number): number {
  const mx = Math.round(width * 0.04), my = Math.round(height * 0.04);
  const x0 = mx, x1 = width - mx, y0 = my, y1 = height - my;
  if (x1 - x0 < CELL || y1 - y0 < CELL) return 0;

  // Paper colour: a high percentile of the inner area, so text doesn't drag it down.
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { hist[lum[y * width + x]]++; n++; }
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.6) { paper = v; break; } }
  // Marks must be well below the paper: show-through is usually only 20–40 levels darker.
  const dark = Math.max(30, paper - 70);

  let cells = 0, inked = 0;
  for (let cy = y0; cy + CELL <= y1; cy += CELL) {
    for (let cx = x0; cx + CELL <= x1; cx += CELL) {
      let d = 0;
      for (let y = cy; y < cy + CELL; y++) for (let x = cx; x < cx + CELL; x++) if (lum[y * width + x] < dark) d++;
      cells++;
      if (d >= 4) inked++; // a lone speck of dust is 1–3 pixels at this size
    }
  }
  return cells ? inked / cells : 0;
}

const BLANK_NOTE = /^(this\s+page\s+(is\s+)?(has\s+been\s+)?(intentionally|deliberately)\s+(been\s+)?left\s+blank|intentionally\s+(left\s+)?blank|page\s+intentionally\s+blank|blank\s+page)\.?$/i;

/** Classifies a page's selectable text. */
export function textSignal(text: string): { hasText: boolean; saysBlank: boolean; anyText: boolean } {
  const t = text.replace(/\s+/g, " ").trim();
  const anyText = t.length > 0;
  // Drop a page number such as "12", "- 12 -" or "Page 12 of 40".
  const core = t.replace(/\b(page\s+)?\d+(\s+of\s+\d+)?\b/gi, "").replace(/[-–—|]/g, "").trim();
  if (BLANK_NOTE.test(core)) return { hasText: false, saysBlank: true, anyText };
  return { hasText: /[A-Za-z]{2,}/.test(core), saysBlank: false, anyText };
}

/** A page with only a page number counts as blank under "nearly" only. */
export const isBlank = (p: PageCheck, strictness: Strictness, includeNotes: boolean) =>
  (p.saysBlank && includeNotes) ||
  (!p.hasText && !p.saysBlank && (!p.anyText || strictness === "nearly") && p.ink <= LIMITS[strictness]);

/** Draws and measures every page. */
export async function checkPages(file: File, onProgress?: (done: number, total: number) => void): Promise<PageCheck[]> {
  const { loadPdfDocument } = await import("./pdfjs");
  const pdf = await loadPdfDocument(file);
  const out: PageCheck[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 420 / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp } as any).promise;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const lum = new Uint8Array(width * height);
      for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
      const thumb = canvas.toDataURL("image/jpeg", 0.6);
      canvas.width = canvas.height = 0;
      let text = "";
      try { text = (await page.getTextContent()).items.map((i: any) => i.str ?? "").join(" "); } catch { /* no text layer */ }
      out.push({ page: n, ink: inkShare(lum, width, height), ...textSignal(text), thumb });
      page.cleanup();
      onProgress?.(n, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }
  return out;
}

/** Saves a copy without the given pages (1-based). Keeps links, forms and quality. */
export async function removePages(file: File, pages: number[]): Promise<File> {
  const { loadPdfForEditing, makePdfFile } = await import("./pdfUtils");
  const doc = await loadPdfForEditing(await file.arrayBuffer());
  [...new Set(pages)].sort((a, b) => b - a).forEach((p) => doc.removePage(p - 1));
  return makePdfFile(await doc.save(), file.name.replace(/\.pdf$/i, "") + "_no_blanks.pdf");
}
