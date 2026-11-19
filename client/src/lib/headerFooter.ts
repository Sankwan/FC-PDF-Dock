import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { pagePlacer } from "./editor/exportPdf";
import { fitFontCharset } from "./pdfText";
import { shownSize } from "./watermark";

export interface Slots { left: string; center: string; right: string }

export interface HeaderFooterOptions {
  header: Slots;
  footer: Slots;
  /** points */
  fontSize: number;
  /** distance from the page edge, points */
  margin: number;
  skipFirst: boolean;
  /** with skipFirst: false = the page after the cover is page 1 */
  countCover: boolean;
  /** the number shown on the first numbered page (e.g. 45 for an annex) */
  startAt: number;
  /** pad {page} with zeros to this many digits (0 = none), for reference numbers like 0001 */
  digits: number;
  colour: "grey" | "black";
}

export const DEFAULT_HEADER_FOOTER: HeaderFooterOptions = {
  header: { left: "", center: "", right: "" },
  footer: { left: "", center: "", right: "" },
  fontSize: 9,
  margin: 28,
  skipFirst: false,
  countCover: true,
  startAt: 1,
  digits: 0,
  colour: "grey",
};

export const TOKENS = [
  { token: "{page}", label: "Page number" },
  { token: "{pages}", label: "Total pages" },
  { token: "{date}", label: "Today's date" },
  { token: "{filename}", label: "File name" },
] as const;

export interface FillContext { page: number; pages: number; date: Date; fileName: string; digits?: number }

export const fillTokens = (text: string, c: FillContext) =>
  text
    .replace(/\{page\}/gi, String(c.page).padStart(c.digits ?? 0, "0"))
    .replace(/\{pages\}/gi, String(c.pages))
    .replace(/\{date\}/gi, c.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))
    .replace(/\{filename\}/gi, c.fileName.replace(/\.pdf$/i, ""));

export const isEmpty = (o: HeaderFooterOptions) =>
  ![o.header.left, o.header.center, o.header.right, o.footer.left, o.footer.center, o.footer.right].some((t) => t.trim());

/** The number printed on physical page `physical` (1-based), and the last number. */
export const pageNumbering = (o: Pick<HeaderFooterOptions, "skipFirst" | "countCover" | "startAt">, physical: number, totalPages: number) => {
  const offset = o.skipFirst && !o.countCover ? 1 : 0;
  const start = Math.max(0, Math.round(o.startAt || 1));
  return { page: start + physical - 1 - offset, pages: start + totalPages - 1 - offset };
};

export interface PlacedText { text: string; x: number; baselineFromTop: number; width: number; size: number; row: "header" | "footer"; changed: boolean }

/** Where each piece of header/footer text goes on a page of the given (shown) size. */
export function layoutHeaderFooter(
  o: HeaderFooterOptions,
  size: { width: number; height: number },
  font: PDFFont,
  ctx: { fileName: string; totalPages: number; physical: number; date: Date },
): PlacedText[] {
  if (o.skipFirst && ctx.physical === 1) return [];
  const { width, height } = size;
  const fontSize = Math.min(o.fontSize, height / 20);
  const margin = Math.min(o.margin, width / 5, height / 5);
  const n = pageNumbering(o, ctx.physical, ctx.totalPages);
  const out: PlacedText[] = [];
  const rows: ["header" | "footer", Slots, number][] = [["header", o.header, margin + fontSize * 0.75], ["footer", o.footer, height - margin]];
  for (const [row, slots, baselineFromTop] of rows) {
    (["left", "center", "right"] as const).forEach((pos) => {
      const raw = slots[pos].trim();
      if (!raw) return;
      const fitted = fitFontCharset(font, fillTokens(raw, { ...n, date: ctx.date, fileName: ctx.fileName, digits: o.digits }));
      const w = font.widthOfTextAtSize(fitted.text, fontSize);
      const x = pos === "left" ? margin : pos === "right" ? width - margin - w : (width - w) / 2;
      out.push({ text: fitted.text, x, baselineFromTop, width: w, size: fontSize, row, changed: fitted.changed });
    });
  }
  return out;
}

/**
 * Writes the header and footer text on each page of `doc` as real text.
 * `firstPage` is the number of the doc's first page in the whole file (a
 * preview works on a single copied page).
 */
export async function applyHeaderFooter(
  doc: PDFDocument,
  o: HeaderFooterOptions,
  ctx: { fileName: string; totalPages: number; firstPage?: number; date?: Date },
): Promise<{ changedText: boolean }> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const colour = o.colour === "grey" ? rgb(0.35, 0.35, 0.35) : rgb(0.08, 0.08, 0.08);
  const date = ctx.date ?? new Date();
  let changedText = false;

  doc.getPages().forEach((page, i) => {
    const physical = (ctx.firstPage ?? 1) + i;
    const { at, rotate } = pagePlacer(page);
    for (const t of layoutHeaderFooter(o, shownSize(page), font, { fileName: ctx.fileName, totalPages: ctx.totalPages, physical, date })) {
      changedText ||= t.changed;
      const p = at(t.x, t.baselineFromTop);
      page.drawText(t.text, { x: p.x, y: p.y, size: t.size, font, color: colour, rotate });
    }
  });
  return { changedText };
}

/**
 * Pages where the header or footer would print over the page's own content.
 * `pages` holds each page's pixels (luminance, top-left origin) and shown
 * size in points; the check looks for ink under each piece of text.
 */
export function findOverlaps(
  o: HeaderFooterOptions,
  pages: { lum: Uint8Array; px: number; py: number; width: number; height: number }[],
  font: PDFFont,
  fileName: string,
  totalPages: number,
): number[] {
  const hits: number[] = [];
  const date = new Date();
  pages.forEach((pg, i) => {
    const k = pg.px / pg.width;
    const placed = layoutHeaderFooter(o, pg, font, { fileName, totalPages, physical: i + 1, date });
    const covered = placed.some((t) => {
      // The text's box plus breathing room: text 2–3 mm away still reads as crammed together.
      const pad = t.size * 0.8;
      const x0 = Math.max(0, Math.floor((t.x - pad) * k)), x1 = Math.min(pg.px - 1, Math.ceil((t.x + t.width + pad) * k));
      const y0 = Math.max(0, Math.floor((t.baselineFromTop - t.size * 0.8 - pad) * k)), y1 = Math.min(pg.py - 1, Math.ceil((t.baselineFromTop + t.size * 0.25 + pad) * k));
      let dark = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pg.lum[y * pg.px + x] < 200) dark++;
      return dark >= Math.max(3, (x1 - x0 + 1) * (y1 - y0 + 1) * 0.01);
    });
    if (covered) hits.push(i + 1);
  });
  return hits;
}

/** Each page drawn small, as luminance, for the overlap check. Browser only. */
export async function pageInk(file: File, maxPages = 60, longSide = 500) {
  const { loadPdfDocument } = await import("./pdfjs");
  const pdf = await loadPdfDocument(file);
  const out: { lum: Uint8Array; px: number; py: number; width: number; height: number }[] = [];
  try {
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: longSide / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp } as any).promise;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.height = 0;
      const lum = new Uint8Array(width * height);
      for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
      out.push({ lum, px: width, py: height, width: base.width, height: base.height });
    }
  } finally {
    await pdf.destroy();
  }
  return out;
}

export async function headerFooterPdf(file: File, o: HeaderFooterOptions) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const { changedText } = await applyHeaderFooter(doc, o, { fileName: file.name, totalPages: doc.getPageCount() });
  const bytes = await doc.save();
  return { file: new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, "") + "_headers.pdf", { type: "application/pdf" }), changedText };
}
