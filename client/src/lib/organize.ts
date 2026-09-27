import { PDFDocument, degrees } from "pdf-lib";
import { loadPdfForEditing, makePdfFile } from "./pdfUtils";
import { loadPdfDocument } from "./pdfjs";

export interface SourcePdf {
  id: string;
  file: File;
}

export interface PageItem {
  /** unique per card, so duplicated pages can be told apart */
  key: string;
  sourceId: string;
  /** 0-based page index in the source file */
  index: number;
  /** extra rotation chosen by the user, in degrees (multiple of 90) */
  rotation: number;
  /** the page's own rotation from the file */
  baseRotation: number;
  thumb?: string;
  width: number;
  height: number;
}

let seq = 0;
export const newKey = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Lists a PDF's pages and renders small thumbnails, calling back as each is ready. */
export const readPages = async (
  source: SourcePdf,
  onThumb: (key: string, url: string) => void
): Promise<PageItem[]> => {
  const pdf = await loadPdfDocument(source.file);
  const items: PageItem[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: 1, rotation: 0 });
    items.push({ key: newKey(), sourceId: source.id, index: i, rotation: 0, baseRotation: page.rotate, width: vp.width, height: vp.height });
  }
  // Thumbnails render in the background so the grid appears immediately.
  (async () => {
    try {
      for (const item of items) {
        const page = await pdf.getPage(item.index + 1);
        const base = page.getViewport({ scale: 1, rotation: 0 });
        const scale = 220 / Math.max(base.width, base.height);
        const vp = page.getViewport({ scale, rotation: 0 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport: vp } as any).promise;
        onThumb(item.key, canvas.toDataURL("image/jpeg", 0.75));
        canvas.width = canvas.height = 0;
      }
    } finally {
      await pdf.destroy();
    }
  })();
  return items;
};

/** Builds the new PDF from the arranged cards. Pages are copied, not re-drawn, so text stays intact. */
export const buildOrganizedPdf = async (sources: SourcePdf[], pages: PageItem[], name: string): Promise<File> => {
  const out = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();
  for (const s of sources) {
    if (pages.some((p) => p.sourceId === s.id)) loaded.set(s.id, await loadPdfForEditing(await s.file.arrayBuffer()));
  }
  for (const p of pages) {
    if (p.index < 0) {
      // Blank page, sized like the page before it (or A4).
      const prev = out.getPageCount() ? out.getPage(out.getPageCount() - 1).getSize() : { width: 595.28, height: 841.89 };
      out.addPage([prev.width, prev.height]);
      continue;
    }
    const src = loaded.get(p.sourceId)!;
    const [copied] = await out.copyPages(src, [p.index]);
    copied.setRotation(degrees((((p.baseRotation + p.rotation) % 360) + 360) % 360));
    out.addPage(copied);
  }
  return makePdfFile(await out.save({ useObjectStreams: true }), name);
};
