import { PDFDocument, StandardFonts } from "pdf-lib";
import { brand } from "@/brand";
import { createLocalOcrWorker } from "./ocrUtils";
import { addOcrTextLayer } from "./ocrLayer";
import { makePdfFile } from "./pdfUtils";

export type PageSize = "a4" | "letter" | "fit";

export const PAGE_SIZES: { id: PageSize; label: string }[] = [
  { id: "a4", label: "A4" },
  { id: "letter", label: "Letter" },
  { id: "fit", label: "Same as scan" },
];

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

export interface ScannedImage {
  blob: Blob;
  width: number;
  height: number;
}

export const defaultScanName = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Scan ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
};

export const buildScanPdf = async (
  images: ScannedImage[],
  opts: { pageSize: PageSize; searchable: boolean; name: string; onProgress?: (done: number, total: number, stage: string) => void }
): Promise<File> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const worker = opts.searchable ? await createLocalOcrWorker() : null;
  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      opts.onProgress?.(i, images.length, opts.searchable ? `Reading text on page ${i + 1}` : `Adding page ${i + 1}`);
      const bytes = new Uint8Array(await img.blob.arrayBuffer());
      const embedded = img.blob.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const landscape = img.width > img.height;
      let pw: number;
      let ph: number;
      if (opts.pageSize === "fit") {
        // Scale so the long side matches A4's long side.
        const s = 841.89 / Math.max(img.width, img.height);
        pw = img.width * s;
        ph = img.height * s;
      } else {
        const [w, h] = SIZES[opts.pageSize];
        [pw, ph] = landscape ? [h, w] : [w, h];
      }
      const s = Math.min(pw / img.width, ph / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      const x = (pw - dw) / 2;
      const y = (ph - dh) / 2;
      const page = doc.addPage([pw, ph]);
      page.drawImage(embedded, { x, y, width: dw, height: dh });

      if (worker) {
        const bitmap = await createImageBitmap(img.blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();
        // Offset is measured from the page's top-left, like the OCR boxes.
        await addOcrTextLayer(worker, page, font, canvas, 1 / s, { x, y: ph - y - dh });
        canvas.width = canvas.height = 0;
      }
    }
  } finally {
    await worker?.terminate();
  }
  doc.setTitle(opts.name);
  doc.setCreator(brand.name);
  doc.setProducer(brand.name);
  const safe = opts.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || defaultScanName();
  return makePdfFile(await doc.save({ useObjectStreams: true }), `${safe}.pdf`);
};
