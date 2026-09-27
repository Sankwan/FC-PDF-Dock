import { type PDFFont, type PDFPage, TextRenderingMode, setCharacterSqueeze, setTextRenderingMode } from "pdf-lib";
import type { createLocalOcrWorker } from "./ocrUtils";

type OcrWorker = Awaited<ReturnType<typeof createLocalOcrWorker>>;

const MIN_CONFIDENCE = 55;

/**
 * Recognises the text in `image` and writes it onto `page` as invisible,
 * correctly positioned text: the page looks the same, but its words can be
 * searched, selected and copied. `pxPerPt` is how many image pixels make one
 * PDF point on this page.
 */
export const addOcrTextLayer = async (
  worker: OcrWorker,
  page: PDFPage,
  font: PDFFont,
  image: HTMLCanvasElement,
  pxPerPt: number,
  offset: { x: number; y: number } = { x: 0, y: 0 }
) => {
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const words: any[] = data.blocks?.flatMap((b: any) => b.paragraphs.flatMap((p: any) => p.lines.flatMap((l: any) => l.words))) ?? [];
  const pageHeight = page.getHeight();
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
  for (const word of words) {
    const text = String(word.text ?? "").trim();
    // Photos, stamps and redaction boxes produce low-confidence junk "words";
    // leaving them out keeps search results and copied text clean.
    if (!text || (typeof word.confidence === "number" && word.confidence < MIN_CONFIDENCE)) continue;
    const w = (word.bbox.x1 - word.bbox.x0) / pxPerPt;
    const h = (word.bbox.y1 - word.bbox.y0) / pxPerPt;
    if (w <= 0 || h <= 0) continue;
    const size = Math.max(1, h * 0.9);
    let natural = 0;
    try {
      natural = font.widthOfTextAtSize(text, size);
    } catch {
      continue; // characters the standard font can't encode
    }
    page.pushOperators(setCharacterSqueeze(natural > 0 ? Math.min(400, Math.max(1, (w / natural) * 100)) : 100));
    page.drawText(text, { x: offset.x + word.bbox.x0 / pxPerPt, y: pageHeight - offset.y - word.bbox.y1 / pxPerPt, size, font });
  }
  page.pushOperators(setCharacterSqueeze(100), setTextRenderingMode(TextRenderingMode.Fill));
  return String(data.text ?? "");
};
