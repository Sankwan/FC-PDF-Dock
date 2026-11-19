import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pagePlacer } from "./editor/exportPdf";
import { fitFontCharset } from "./pdfText";

export type WatermarkLayout = "centre" | "tiled";
export type WatermarkColour = "red" | "grey" | "black" | "green" | "blue";

export interface WatermarkOptions {
  text: string;
  /** 0–1 */
  opacity: number;
  fontSize: number;
  layout: WatermarkLayout;
  /** degrees, anticlockwise as the page is seen: 45 diagonal, 0 straight */
  angle: number;
  colour: WatermarkColour;
}

export const DEFAULT_WATERMARK: WatermarkOptions = { text: "CONFIDENTIAL", opacity: 0.2, fontSize: 48, layout: "centre", angle: 45, colour: "red" };

export const WATERMARK_COLOURS: Record<WatermarkColour, { label: string; rgb: [number, number, number]; css: string }> = {
  red: { label: "Red", rgb: [0.85, 0.1, 0.1], css: "#d91a1a" },
  grey: { label: "Grey", rgb: [0.45, 0.45, 0.45], css: "#737373" },
  black: { label: "Black", rgb: [0.1, 0.1, 0.1], css: "#1a1a1a" },
  green: { label: "Green", rgb: [0.1, 0.45, 0.2], css: "#1a7333" },
  blue: { label: "Blue", rgb: [0.1, 0.25, 0.7], css: "#1a40b3" },
};

/** Size of the page as people see it (after /Rotate). */
export const shownSize = (page: PDFPage) => {
  const box = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  return r === 90 || r === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
};

/** Draws `text` centred on (cx, cy) of the page as seen (top-left origin), turned by `angle`. */
const drawCentred = (page: PDFPage, font: PDFFont, text: string, size: number, cx: number, cy: number, angle: number, colour: [number, number, number], opacity: number) => {
  const { at, rotate } = pagePlacer(page);
  const w = font.widthOfTextAtSize(text, size);
  const a = (angle * Math.PI) / 180;
  // Baseline start, in y-up coordinates relative to the centre.
  const ux = -w / 2, uy = -size * 0.35;
  const dx = ux * Math.cos(a) - uy * Math.sin(a);
  const dy = ux * Math.sin(a) + uy * Math.cos(a);
  const p = at(cx + dx, cy - dy);
  page.drawText(text, { x: p.x, y: p.y, size, font, color: rgb(...colour), opacity, rotate: degrees(rotate.angle + angle) });
};

/** Stamps every page of `doc`. Returns whether some characters had to be replaced. */
export async function applyWatermark(doc: PDFDocument, options: WatermarkOptions): Promise<{ changedText: boolean }> {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { text, changed } = fitFontCharset(font, options.text.trim());
  if (!text) return { changedText: changed };
  const colour = WATERMARK_COLOURS[options.colour].rgb;
  const a = (options.angle * Math.PI) / 180;

  for (const page of doc.getPages()) {
    const { width, height } = shownSize(page);
    if (options.layout === "centre") {
      // Shrink to fit across the page in the chosen direction.
      const room = Math.abs(Math.cos(a)) > 0.99 ? width * 0.9 : Math.hypot(width, height) * 0.8;
      let size = options.fontSize;
      while (size > 8 && font.widthOfTextAtSize(text, size) > room) size -= 2;
      drawCentred(page, font, text, size, width / 2, height / 2, options.angle, colour, options.opacity);
      continue;
    }
    // Tiled: a grid laid out along the text direction, alternate rows offset.
    const size = Math.max(8, options.fontSize * 0.6);
    const tw = font.widthOfTextAtSize(text, size);
    const stepU = tw + size * 3;
    const stepV = size * 4;
    const reach = Math.hypot(width, height) / 2 + tw;
    for (let v = -reach, row = 0; v <= reach; v += stepV, row++) {
      for (let u = -reach + (row % 2 ? stepU / 2 : 0); u <= reach; u += stepU) {
        const cx = width / 2 + u * Math.cos(a) + v * Math.sin(a);
        const cy = height / 2 - (u * Math.sin(a) - v * Math.cos(a));
        if (cx < -tw / 2 || cx > width + tw / 2 || cy < -tw / 2 || cy > height + tw / 2) continue;
        drawCentred(page, font, text, size, cx, cy, options.angle, colour, options.opacity);
      }
    }
  }
  return { changedText: changed };
}

export async function watermarkPdf(file: File, options: WatermarkOptions): Promise<{ file: File; changedText: boolean }> {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const { changedText } = await applyWatermark(doc, options);
  const bytes = await doc.save();
  return { file: new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, "") + "_watermarked.pdf", { type: "application/pdf" }), changedText };
}
