import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  setTextRenderingMode,
  setCharacterSqueeze,
} from "pdf-lib";
import { createWorker, OEM } from "tesseract.js";
import { loadPdfDocument, renderPdfPageToCanvas } from "./pdfjs";
import { brand } from "@/brand";

/**
 * All three tesseract.js runtime pieces (worker script, WASM core, language
 * data) are served from client/public/tesseract/ instead of tesseract.js's
 * default jsdelivr CDN — same "never leaves the device" rule as the bundled
 * pdf.js worker in pdfjs.ts. The core build is SIMD-only (no fallback
 * variant shipped) to keep the precache small; SIMD has shipped in every
 * major browser since 2021.
 */
const TESSERACT_BASE = "/tesseract";

const createLocalOcrWorker = (onProgress?: (status: string, progress: number) => void) =>
  createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${TESSERACT_BASE}/worker.min.js`,
    corePath: `${TESSERACT_BASE}/core/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${TESSERACT_BASE}/lang`,
    gzip: true,
    workerBlobURL: false,
    logger: (m) => onProgress?.(m.status, m.progress),
  });

interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrPdfOptions {
  /** Render scale used before OCR — higher catches smaller text but is slower. */
  scale?: number;
  onProgress?: (done: number, total: number, status: string) => void;
}

/**
 * OCRs every page of a PDF and returns a new PDF where each page is the
 * original page image with the recognized words drawn as an invisible
 * (Tr 3) text layer positioned over their source word, making the page
 * searchable/selectable without changing how it looks.
 */
export const makeSearchablePdf = async (
  pdfFile: File,
  options: OcrPdfOptions = {}
): Promise<{ file: File; text: string }> => {
  const { scale = 2.5, onProgress } = options;

  const pdf = await loadPdfDocument(pdfFile);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  let worker: Awaited<ReturnType<typeof createLocalOcrWorker>> | null = null;
  const pageTexts: string[] = [];

  try {
    worker = await createLocalOcrWorker((status, progress) =>
      onProgress?.(0, pdf.numPages, `${status} (${Math.round(progress * 100)}%)`)
    );

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.(pageNum - 1, pdf.numPages, "Rendering page");
      const canvas = await renderPdfPageToCanvas(pdf, pageNum, scale);

      const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const jpg = await outDoc.embedJpg(jpgDataUrl);

      const pageWidthPts = canvas.width / scale;
      const pageHeightPts = canvas.height / scale;
      const page = outDoc.addPage([pageWidthPts, pageHeightPts]);
      page.drawImage(jpg, { x: 0, y: 0, width: pageWidthPts, height: pageHeightPts });

      onProgress?.(pageNum - 1, pdf.numPages, "Recognizing text");
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      pageTexts.push(data.text ?? "");

      const words: OcrWord[] =
        data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words)
          )
        ) ?? [];

      // Draw each word as invisible text sized/stretched to match its
      // source bounding box, so search-highlighting lands roughly on the
      // visible word even though nothing is actually painted.
      page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
      for (const word of words) {
        const text = word.text.trim();
        if (!text) continue;

        const boxWidthPts = (word.bbox.x1 - word.bbox.x0) / scale;
        const boxHeightPts = (word.bbox.y1 - word.bbox.y0) / scale;
        if (boxWidthPts <= 0 || boxHeightPts <= 0) continue;

        const fontSize = Math.max(1, boxHeightPts * 0.9);
        const naturalWidth = font.widthOfTextAtSize(text, fontSize);
        const squeeze = naturalWidth > 0 ? Math.min(400, Math.max(1, (boxWidthPts / naturalWidth) * 100)) : 100;

        const x = word.bbox.x0 / scale;
        const y = pageHeightPts - word.bbox.y1 / scale;

        page.pushOperators(setCharacterSqueeze(squeeze));
        page.drawText(text, { x, y, size: fontSize, font });
      }
      page.pushOperators(setCharacterSqueeze(100), setTextRenderingMode(TextRenderingMode.Fill));

      onProgress?.(pageNum, pdf.numPages, "Recognizing text");
    }
  } finally {
    await worker?.terminate();
    await pdf.destroy();
  }

  outDoc.setProducer(brand.name);
  outDoc.setCreator(brand.name);
  const bytes = await outDoc.save();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const file = new File(
    [copy],
    pdfFile.name.replace(/\.pdf$/i, "") + "_searchable.pdf",
    { type: "application/pdf" }
  );
  return { file, text: pageTexts.join("\n\n") };
};
