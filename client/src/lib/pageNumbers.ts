import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";

export type NumberPosition = "bottom-center" | "bottom-right" | "bottom-left" | "top-center" | "top-right" | "top-left";
export type NumberFormat = "n" | "page-n" | "n-of-total" | "page-n-of-total";

export interface PageNumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  /** The number printed on the first numbered page. */
  startAt: number;
  /** 1-based page where numbering begins (earlier pages, e.g. a cover, get none). */
  fromPage: number;
  fontSize: number;
  /** Distance from the page edge, in PDF points (1 mm ≈ 2.83 pt). */
  margin: number;
}

export const DEFAULT_PAGE_NUMBERS: PageNumberOptions = {
  position: "bottom-center",
  format: "n",
  startAt: 1,
  fromPage: 1,
  fontSize: 11,
  margin: 28,
};

export const formatPageNumber = (format: NumberFormat, n: number, total: number) =>
  format === "page-n" ? `Page ${n}`
    : format === "n-of-total" ? `${n} of ${total}`
    : format === "page-n-of-total" ? `Page ${n} of ${total}`
    : String(n);

/**
 * Maps a point measured on the page as people see it (origin bottom-left,
 * after the page's /Rotate is applied) back into the page's own coordinate
 * space, so numbers on rotated pages still sit at the visual bottom and read
 * upright.
 */
const toPageSpace = (page: PDFPage, vx: number, vy: number) => {
  const { x: cx, y: cy, width: W, height: H } = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const [x, y] = r === 90 ? [W - vy, vx] : r === 180 ? [W - vx, H - vy] : r === 270 ? [vy, H - vx] : [vx, vy];
  return { x: cx + x, y: cy + y };
};

/** Adds page numbers as real text; the existing content is left untouched. */
export async function addPageNumbers(input: ArrayBuffer | Uint8Array, options: Partial<PageNumberOptions> = {}): Promise<Uint8Array> {
  const o = { ...DEFAULT_PAGE_NUMBERS, ...options };
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const first = Math.min(Math.max(1, Math.floor(o.fromPage)), pages.length);
  const numbered = pages.length - first + 1;
  const total = o.startAt + numbered - 1;
  const [vertical, horizontal] = o.position.split("-") as ["top" | "bottom", "left" | "center" | "right"];

  pages.forEach((page, i) => {
    if (i + 1 < first) return;
    const text = formatPageNumber(o.format, o.startAt + (i + 1 - first), total);
    const { width, height, rotate } = (() => {
      const box = page.getCropBox();
      const r = ((page.getRotation().angle % 360) + 360) % 360;
      return r === 90 || r === 270 ? { width: box.height, height: box.width, rotate: r } : { width: box.width, height: box.height, rotate: r };
    })();
    const size = Math.min(o.fontSize, height / 10);
    const margin = Math.min(o.margin, width / 4, height / 4);
    const textWidth = font.widthOfTextAtSize(text, size);
    const vx = horizontal === "left" ? margin : horizontal === "right" ? width - margin - textWidth : (width - textWidth) / 2;
    const vy = vertical === "top" ? height - margin - size * 0.72 : margin;
    const at = toPageSpace(page, vx, vy);
    page.drawText(text, { x: at.x, y: at.y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(rotate) });
  });

  return doc.save();
}
