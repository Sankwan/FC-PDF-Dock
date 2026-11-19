import {
  PDFDocument, StandardFonts, degrees, rgb, LineCapStyle,
  type PDFFont, type PDFPage, type RGB,
} from "pdf-lib";
import type { EditorObject, FontFamily, Point, TextObject } from "./types";

/**
 * Writes the editor's objects into the PDF with pdf-lib. Text stays real
 * text (selectable and searchable), signatures and images stay images, and
 * shapes and ink become vector drawings. The original page content is not
 * touched; edited text is painted over and the new text drawn on top.
 */

export interface ExportResult {
  bytes: Uint8Array;
  /** At least one signature was placed. */
  signed: boolean;
  /** Existing text was replaced by covering it (it is still in the file underneath). */
  covered: boolean;
}

export interface ExportOptions {
  /**
   * Draws text the standard PDF fonts can't encode (for example Twi ɛ and ɔ)
   * as a PNG. Without it such text is reported as an error.
   */
  rasterizeText?: (o: TextObject) => Promise<Uint8Array>;
}

/** Where the first baseline sits below the top of a text box, per font size (matches the editor's CSS). */
export const BASELINE: Record<FontFamily, number> = { sans: 0.947, serif: 0.938, mono: 0.866 };
export const LINE_HEIGHT = 1.2;

const FONT_FILES: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Converts points on the page as displayed (origin top-left, rotation
 * applied) into the page's own coordinates, and gives the rotation to draw
 * with so that content reads upright.
 */
export const pagePlacer = (page: PDFPage) => {
  const { x: cx, y: cy, width: W, height: H } = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const shownH = r === 90 || r === 270 ? W : H;
  const at = (vx: number, vyTop: number) => {
    const vy = shownH - vyTop; // measured from the bottom as displayed
    const [x, y] = r === 90 ? [W - vy, vx] : r === 180 ? [W - vx, H - vy] : r === 270 ? [vy, H - vx] : [vx, vy];
    return { x: cx + x, y: cy + y };
  };
  return { at, rotate: degrees(r) };
};

const dataUrlBytes = (src: string) => {
  const b64 = src.slice(src.indexOf(",") + 1);
  if (typeof atob === "function") return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Uint8Array(Buffer.from(b64, "base64"));
};

/** An SVG path (y down) in points, relative to (ox, oy) on the displayed page. */
const svgPath = (strokes: Point[][], ox: number, oy: number) =>
  strokes.filter((s) => s.length).map((s) =>
    (s.length === 1 ? [s[0], { x: s[0].x + 0.01, y: s[0].y }] : s)
      .map((p, i) => `${i ? "L" : "M"}${(p.x - ox).toFixed(2)} ${(p.y - oy).toFixed(2)}`).join(" ")
  ).join(" ");

export async function exportEditedPdf(input: ArrayBuffer | Uint8Array, objects: EditorObject[], options: ExportOptions = {}): Promise<ExportResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const pages = doc.getPages();
  const fonts = new Map<StandardFonts, PDFFont>();
  const font = async (name: StandardFonts) => {
    if (!fonts.has(name)) fonts.set(name, await doc.embedFont(name));
    return fonts.get(name)!;
  };
  let signed = false, covered = false;

  // Covers go down first so no new content ends up hidden beneath another object's cover.
  const ordered = [...objects].sort((a, b) => Number(b.kind === "text" && !!b.cover) - Number(a.kind === "text" && !!a.cover) || Number(b.kind === "whiteout") - Number(a.kind === "whiteout"));
  for (const o of ordered) {
    const page = pages[o.page];
    if (!page) continue;
    const { at, rotate } = pagePlacer(page);
    const color = "color" in o ? hexToRgb(o.color) : rgb(0, 0, 0);
    const box = (x: number, y: number, w: number, h: number) => ({ ...at(x, y + h), width: w, height: h, rotate });

    switch (o.kind) {
      case "text": {
        if (o.cover) {
          page.drawRectangle({ ...box(o.cover.x, o.cover.y, o.cover.w, o.cover.h), color: rgb(1, 1, 1) });
          covered = true;
        }
        if (!o.text.trim()) break;
        const [regular, bold, italic, both] = FONT_FILES[o.font];
        const f = await font(o.bold && o.italic ? both : o.bold ? bold : o.italic ? italic : regular);
        let encodable = true;
        try { f.encodeText(o.text.replace(/\n/g, "")); } catch { encodable = false; }
        if (!encodable) {
          if (!options.rasterizeText) throw new Error(`"${o.text.slice(0, 30)}" has characters the standard PDF fonts can't write.`);
          const png = await doc.embedPng(await options.rasterizeText(o));
          page.drawImage(png, box(o.x, o.y, o.w, o.h));
          break;
        }
        o.text.split("\n").forEach((line, i) => {
          if (!line) return;
          const p = at(o.x, o.y + o.size * (BASELINE[o.font] + i * LINE_HEIGHT));
          page.drawText(line, { x: p.x, y: p.y, size: o.size, font: f, color, rotate });
        });
        break;
      }
      case "image": {
        const bytes = dataUrlBytes(o.src);
        const img = o.src.startsWith("data:image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        page.drawImage(img, box(o.x, o.y, o.w, o.h));
        if (o.signature) signed = true;
        break;
      }
      case "whiteout":
        page.drawRectangle({ ...box(o.x, o.y, o.w, o.h), color: rgb(1, 1, 1) });
        break;
      case "rect":
        page.drawRectangle({ ...box(o.x, o.y, o.w, o.h), borderColor: color, borderWidth: o.stroke });
        break;
      case "ellipse": {
        const c = at(o.x + o.w / 2, o.y + o.h / 2);
        page.drawEllipse({ x: c.x, y: c.y, xScale: o.w / 2, yScale: o.h / 2, borderColor: color, borderWidth: o.stroke, rotate });
        break;
      }
      case "check":
      case "cross": {
        const s = o.kind === "check"
          ? [[{ x: o.x + o.w * 0.12, y: o.y + o.h * 0.55 }, { x: o.x + o.w * 0.4, y: o.y + o.h * 0.85 }, { x: o.x + o.w * 0.9, y: o.y + o.h * 0.15 }]]
          : [[{ x: o.x + o.w * 0.15, y: o.y + o.h * 0.15 }, { x: o.x + o.w * 0.85, y: o.y + o.h * 0.85 }], [{ x: o.x + o.w * 0.85, y: o.y + o.h * 0.15 }, { x: o.x + o.w * 0.15, y: o.y + o.h * 0.85 }]];
        const origin = at(o.x, o.y);
        page.drawSvgPath(svgPath(s, o.x, o.y), { ...origin, borderColor: color, borderWidth: o.stroke, rotate, borderLineCap: LineCapStyle.Round });
        break;
      }
      case "line":
      case "arrow": {
        const strokes: Point[][] = [[o.from, o.to]];
        if (o.kind === "arrow") {
          const ang = Math.atan2(o.to.y - o.from.y, o.to.x - o.from.x);
          const len = Math.max(6, o.stroke * 4);
          const wing = (a: number) => ({ x: o.to.x - len * Math.cos(ang + a), y: o.to.y - len * Math.sin(ang + a) });
          strokes.push([wing(0.5), o.to, wing(-0.5)]);
        }
        const origin = at(o.x, o.y);
        page.drawSvgPath(svgPath(strokes, o.x, o.y), { ...origin, borderColor: color, borderWidth: o.stroke, rotate, borderLineCap: LineCapStyle.Round });
        break;
      }
      case "ink": {
        const origin = at(o.x, o.y);
        page.drawSvgPath(svgPath(o.strokes, o.x, o.y), {
          ...origin, borderColor: color, borderWidth: o.stroke, rotate, borderLineCap: LineCapStyle.Round,
          borderOpacity: o.highlighter ? 0.35 : 1,
        });
        break;
      }
      case "stamp": {
        const f = await font(StandardFonts.HelveticaBold);
        const size = o.h * 0.5;
        const tw = f.widthOfTextAtSize(o.text, size);
        page.drawRectangle({ ...box(o.x, o.y, o.w, o.h), borderColor: color, borderWidth: Math.max(1, o.h * 0.06) });
        const p = at(o.x + (o.w - tw) / 2, o.y + o.h / 2 + size * 0.35);
        page.drawText(o.text, { x: p.x, y: p.y, size, font: f, color, rotate });
        break;
      }
    }
  }

  return { bytes: await doc.save(), signed, covered };
}
