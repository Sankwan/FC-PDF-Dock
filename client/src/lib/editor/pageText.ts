import { pdfjs, type loadPdfDocument } from "@/lib/pdfjs";
import type { FontFamily } from "./types";

type PdfJsDoc = Awaited<ReturnType<typeof loadPdfDocument>>;

/** A piece of existing text that can be tapped and retyped. */
export interface TextBlock {
  text: string;
  /** Box in displayed page points (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  size: number;
  font: FontFamily;
  bold: boolean;
  italic: boolean;
}

const familyOf = (generic: string, name: string): FontFamily =>
  /courier|mono/i.test(name) || generic === "monospace" ? "mono"
    : /times|serif|georgia|garamond|cambria|book/i.test(name) && !/sans/i.test(name) ? "serif"
    : generic === "serif" && !/arial|helvetica|calibri|sans|verdana|segoe/i.test(name) ? "serif"
    : "sans";

/**
 * Reads a page's text as editable blocks: runs on the same baseline that sit
 * close together are joined, so "Name: ____" and "Date: ____" on one line
 * stay separate but a sentence stays whole. Only horizontal text is offered.
 */
export async function readTextBlocks(pdf: PdfJsDoc, pageNumber: number): Promise<TextBlock[]> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const styles = content.styles as Record<string, { fontFamily: string }>;
  type Run = TextBlock & { end: number };
  const runs: Run[] = [];

  for (const item of content.items as any[]) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const size = Math.hypot(tx[2], tx[3]);
    if (size <= 0 || Math.abs(tx[1]) > 0.01 * Math.abs(tx[0])) continue;
    const xScale = Math.hypot(tx[0], tx[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1);
    const w = (item.width || 0) * xScale;
    // Once a page has been drawn, pdf.js knows each font's real name and weight.
    let name = "", bold = false, italic = false;
    try {
      if (page.commonObjs.has(item.fontName)) {
        const f = page.commonObjs.get(item.fontName) ?? {};
        name = f.name ?? f.loadedName ?? "";
        bold = !!f.bold || /bold|black|heavy|semibold|demi/i.test(name);
        italic = !!f.italic || /italic|oblique/i.test(name);
      }
    } catch { /* font not loaded yet */ }
    const generic = styles[item.fontName]?.fontFamily ?? "sans-serif";
    runs.push({
      text: item.str, x: tx[4], y: tx[5] - size * 0.9, w, h: size * 1.15, baseline: tx[5], size,
      font: familyOf(generic, name), bold, italic,
      end: tx[4] + w,
    });
  }

  runs.sort((a, b) => (Math.abs(a.baseline - b.baseline) < a.size * 0.3 ? a.x - b.x : a.baseline - b.baseline));
  const blocks: TextBlock[] = [];
  for (const r of runs) {
    const last = blocks[blocks.length - 1] as Run | undefined;
    const sameLine = last && Math.abs(last.baseline - r.baseline) < Math.min(last.size, r.size) * 0.3 && Math.abs(last.size - r.size) < last.size * 0.2;
    const gap = last ? r.x - (last.x + last.w) : Infinity;
    if (last && sameLine && gap < r.size * 1.2) {
      const space = gap > r.size * 0.15 && !last.text.endsWith(" ") && !r.text.startsWith(" ") ? " " : "";
      last.text += space + r.text;
      last.w = Math.max(last.w, r.x + r.w - last.x);
      last.bold = last.bold && r.bold;
    } else {
      blocks.push({ ...r });
    }
  }
  return blocks.map(({ text, x, y, w, h, baseline, size, font, bold, italic }) => ({ text: text.trim(), x, y, w, h, baseline, size, font, bold, italic }));
}

/**
 * A signature field label such as "Signature: ______" or "Sign here", rather
 * than the word "signed" in the middle of a sentence.
 */
export const signatureLabel = (blocks: TextBlock[]) =>
  blocks
    .filter((b) => b.text.length <= 60 && /\b(signature|sign here|signed by)\b/i.test(b.text))
    .sort((a, b) => Number(/[:_]/.test(b.text)) - Number(/[:_]/.test(a.text)))[0];

/** The block under a point, if any (with a little slack for fingers). */
export const blockAt = (blocks: TextBlock[], x: number, y: number, slack = 2) =>
  blocks.find((b) => x >= b.x - slack && x <= b.x + b.w + slack && y >= b.y - slack && y <= b.y + b.h + slack);
